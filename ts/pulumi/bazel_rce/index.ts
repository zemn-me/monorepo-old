/**
 * @fileoverview Provisions a bazel remote caching server
 * @see https://bazel.build/remote/caching
 */
import child_process from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import util from 'node:util';

import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';
import * as GitHub from '@pulumi/github';
import * as Pulumi from '@pulumi/pulumi';
import * as random from '@pulumi/random';
import * as bazel from 'ts/bazel';
import { Command } from 'ts/github/actions';
import * as Cert from 'ts/pulumi/lib/certificate';

export interface Args {
	/**
	 * The zone to deploy to
	 */
	zoneId: Pulumi.Input<string>;

	domain: string;

	/**
	 * Adds the prefix STAGING_ to the secret name.
	 */
	stage: boolean;

	mocked: boolean;
}

const deriveAWSRestrictedName =
	(restriction: RegExp) =>
	(maximumLength: number) =>
	(uncontrolledSuffixLength: number) =>
	(suffix: string) =>
	(input: string) =>
		[...input.replaceAll(restriction, '-')]
			.slice(0, maximumLength - suffix.length - uncontrolledSuffixLength)
			.join('') + suffix;

// bucket has a maximum length of 63 (56 minus the 7 random chars that Pulumi adds)

const AWSIdentRestriction = deriveAWSRestrictedName(/[^a-z0-9.-]/g);

const deriveAWSRestrictedBucketName = AWSIdentRestriction(56)(8)('-bucket');

interface DockerFileParams {
	accessKey: string;
	s3Bucket: string;
	s3Endpoint: string;
	accessKeyId: string;
}

const password_file_name = '.htpasswd';

function DockerFile(params: DockerFileParams) {
	return `
# Use a base image with Bazel and other dependencies
FROM buchgr/bazel-remote-cache:latest

USER 65532:65532

EXPOSE 8080

COPY ${password_file_name} ${password_file_name}

# Set the entry point and command
CMD [ \\
	"--s3.auth_method=access_key", \\
	"--s3.secret_access_key=${params.accessKey}", \\
	"--s3.access_key_id=${params.accessKeyId}", \\
	"--s3.bucket=${params.s3Bucket}", \\
	"--s3.endpoint=${params.s3Endpoint}", \\
	"--htpasswd_file=${password_file_name}", \\
	"--http_address=0.0.0.0:8080", \\
	"--max_size", \\
	"5" \\
]


	`;
}

export class BazelRemoteCache extends Pulumi.ComponentResource {
	done: Pulumi.Output<Error[]>;
	constructor(
		name: string,
		args: Args,
		opts?: Pulumi.ComponentResourceOptions
	) {
		super('ts:pulumi:bazel_rce:BazelRemoteCache', name, args, opts);

		//
		// Provision the bucket that will contain the bazel cache
		//

		/**
		 * IAM user for the cache service.
		 */
		const iamuser = new aws.iam.User(
			`${name}_iam_user`,
			{
				path: '/system/',
			},
			{ parent: this }
		);

		/**
		 * Access key for the cache service IAM user.
		 */
		const accessKey = new aws.iam.AccessKey(
			`${name}_user_access_key`,
			{
				user: iamuser.name,
			},
			{ parent: this }
		);

		/**
		 * S3 bucket for cache server backend
		 */
		const bucket = new aws.s3.BucketV2(
			deriveAWSRestrictedBucketName(name),
			{},
			{
				parent: this,
			}
		);

		/**
		 * Bucket policy that allows the cache service IAM user ( @see iamuser )
		 * to read & write to the cache bucket.
		 */
		const bucketPolicy = new aws.s3.BucketPolicy(
			`${name}_bucket_policy`,
			{
				bucket: bucket.id,
				policy: Pulumi.all([iamuser.arn, bucket.arn]).apply(
					([iamuserarn, bucketArn]) =>
						JSON.stringify({
							Version: '2012-10-17',
							Statement: [
								{
									Effect: 'Allow',
									Action: ['s3:ListBucket'],
									Principal: {
										AWS: iamuserarn,
									},
									Resource: [bucketArn],
								},
								{
									Effect: 'Allow',
									Principal: {
										AWS: iamuserarn,
									},
									Action: ['s3:*Object'], // R/W
									Resource: [`${bucketArn}/*`],
								},
							],
						})
				),
			},
			{ parent: this }
		);

		/**
		 * Username used by the GitHub actions runners to use the cache bucket.
		 */
		const username = new random.RandomPassword(
			`${name}_auth_username`,
			{
				length: 25,
			},
			{ parent: this }
		);

		/**
		 * Password used by the GitHub actions runners to use the cache bucket.
		 */
		const password = new random.RandomPassword(
			`${name}_auth_password`,
			{
				length: 25,
			},
			{ parent: this }
		);

		/**
		 * Content for the htpasswd file (auth for the cache server)
		 */
		const htpasswdFileContent = Pulumi.all([username, password]).apply(
			([username, password]) =>
				`${username.result}:${password.bcryptHash}`
		);

		/**
		 * Temporary directory to contain assets needed for the Docker container.
		 */
		const deployContextDirName = (async () => {
			const target = path.join(os.tmpdir(), 'monorepo-pulumi-deploy');
			const temp = await fs.mkdtemp(target);
			return temp;
		})();

		/**
		 * Promise fulfilled when the password file is written
		 */
		const passwordFile = Pulumi.all([
			deployContextDirName,
			htpasswdFileContent,
		]).apply(([dir, content]) =>
			fs.writeFile(path.join(dir, password_file_name), content)
		);

		const dockerFile = Pulumi.all([
			deployContextDirName,
			bucket.id,
			accessKey.secret,
			bucket.bucketRegionalDomainName,
			accessKey.id,
		]).apply(
			([dir, bucketId, secretAccessKey, s3Endpoint, accessKeyId]) => {
				const dockerFileContent = DockerFile({
					s3Bucket: bucketId,
					accessKey: secretAccessKey,
					accessKeyId: accessKeyId,
					s3Endpoint: s3Endpoint,
				});
				return fs.writeFile(dir + '/Dockerfile', dockerFileContent);
			}
		);

		const deployContextDir = Pulumi.all([
			deployContextDirName,
			dockerFile,
			passwordFile,
		]).apply(([dir]) => dir);

		/**
		 * Issue: A Cluster cannot be destroyed unless all its services have been
		 * turned down; but Pulumi doesn't expect this.
		 */

		const cluster = new aws.ecs.Cluster(
			`${name}_cluster`,
			{},
			{ parent: this }
		);

		/**
		 * Get a certificate for the cache server
		 */
		const certReq = new Cert.Certificate(
			`${name}_cert`,
			{
				zoneId: args.zoneId,
				domain: args.domain,
			},
			{ parent: this }
		);

		const loadBalancer = new awsx.lb.ApplicationLoadBalancer(
			AWSIdentRestriction(25)(8)('-alb')(name),
			{
				enableDeletionProtection: false,
				enableHttp2: true,
				defaultTargetGroup: {
					port: 8080,
					targetType: 'ip',
					protocol: 'HTTP',
					healthCheck: {
						enabled: true,
						interval: 30,
						path: '/',
						protocol: 'HTTP',
						timeout: 5,
						unhealthyThreshold: 2,
						healthyThreshold: 2,
						port: '8080',
					},
				},
			},
			{ parent: this }
		);

		// i think this could be merged into loadBalancer but I'm not sure how, as
		// targetGroupArn needs an ARN...
		new aws.lb.Listener(
			AWSIdentRestriction(25)(8)('-listener')(name),
			{
				loadBalancerArn: loadBalancer.loadBalancer.arn,
				port: 443,
				protocol: 'HTTPS',
				certificateArn: certReq.validation.certificateArn,
				sslPolicy: 'ELBSecurityPolicy-2016-08',
				defaultActions: [
					{
						type: 'forward',
						targetGroupArn: loadBalancer.defaultTargetGroup.arn,
					},
				],
			},
			{ parent: this }
		);

		const record = new aws.route53.Record(
			`${name}_record`,
			{
				name: args.domain,
				type: 'CNAME',
				zoneId: args.zoneId,
				ttl: 120,
				records: [loadBalancer.loadBalancer.dnsName],
			},
			{ parent: this, deleteBeforeReplace: true }
		);

		/**
		 * Repository to contain the built Docker image.
		 */
		const repo = new awsx.ecr.Repository(
			`${name}_ecr`,
			{ forceDelete: true },
			{ parent: this }
		);

		/**
		 * The built Docker image (uploaded to the repo).
		 */
		const image = new awsx.ecr.Image(
			`${name}_image`,
			{
				repositoryUrl: repo.url,
				context: deployContextDir,
				platform: 'linux/amd64',
			},
			{ parent: this }
		);

		/**
		 * The cache service itself on fargate.
		 */
		const service = new awsx.ecs.FargateService(
			`${name}_service`,
			{
				// NAT gateway is CRAZY expensive!!!
				assignPublicIp: true,
				cluster: cluster.arn,
				// if we aren't using the cache for a while, it's cool to turn it down
				desiredCount: 1,
				deploymentMinimumHealthyPercent: 100,
				taskDefinitionArgs: {
					container: {
						name: `${name}_container`,
						image: image.imageUri,
						cpu: 128,
						memory: 512,
						essential: true,
						portMappings: [
							{
								hostPort: 8080,
								containerPort: 8080,
								targetGroup: loadBalancer.defaultTargetGroup,
							},
						],
					},
				},
			},
			{
				parent: this,
			}
		);

		if (!process.env['GITHUB_TOKEN'])
			console.log(
				Command('error')({
					file: 'ts/pulumi/bazel_rce/index.ts',
					line: '375',
				})('Missing GITHUB_TOKEN! Will not be able to update GitHub!')
			);

		const httpEndpoint = Pulumi.interpolate`https://${username.result}:${password.result}@${record.name}`;

		new GitHub.ActionsSecret(
			`${name}_actions_secret_cache_url`,
			{
				plaintextValue: httpEndpoint,
				repository: 'monorepo', // error: GET https://api.github.com/repos//zemn-me/monorepo/actions/secrets/public-key: 404 Not Found []
				//                                                                                  ^
				secretName: `BAZEL_REMOTE_CACHE_URL${
					args.stage ? '_staging' : ''
				}`,
			},
			{ parent: this, deleteBeforeReplace: true }
		);

		const tests = new Tests(
			`${name}_tests`,
			{ httpEndpoint, mocked: args.mocked, service },
			{ parent: this }
		);

		this.done = tests.done;

		super.registerOutputs({
			service,
			bucketPolicy,
			success: tests.done,
		});
	}
}

interface TestArgs {
	httpEndpoint: Pulumi.Input<string>;
	service: awsx.ecs.FargateService;
	mocked: boolean;
}

export class Tests extends Pulumi.ComponentResource {
	done: Pulumi.Output<Error[]>;
	constructor(
		name: string,
		args: TestArgs,
		opts?: Pulumi.ComponentResourceOptions
	) {
		super('ts:pulumi:bazel_rce:Tests', name, args, opts);

		if (args.mocked) {
			this.done = Pulumi.output(new Promise(ok => ok([])));
			return;
		}

		// test that everything is working as expected
		this.done = Pulumi.all([
			args.httpEndpoint,
			args.service.service.name,
		]).apply(async ([endpoint, serviceName]) => {
			// build something simple with bazel
			try {
				await util.promisify(child_process.execFile)(
					'bazel',
					['test', '//testing/...', `--remote_cache=${endpoint}`],
					{
						cwd: bazel.workspaceDirectory(),
					}
				);
				return [];
			} catch (e) {
				return [
					new Error(
						`Bazel remote execution failed for ${serviceName}: ${e}${
							e instanceof Object && 'stderr' in e
								? `; ${e.stderr}`
								: ''
						}`
					),
				];
			}
		});

		super.registerOutputs({ done: this.done });
	}
}
