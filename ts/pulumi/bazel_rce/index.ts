/**
 * @fileoverview Provisions a bazel remote caching server
 * @see https://bazel.build/remote/caching
 * 						Internet
 * 	┌───────────────────────┐
 * 	│        Pulumi         │     ─┐
 * 	└───────────────────────┘      │
 * 		│                          │
 * 		│ HTTP Simple Auth URL     │
 * 		▼                          │
 * 	┌───────────────────────┐      │
 * 	│        GitHub         │      │
 * 	└───────────────────────┘      │
 * 		│                          │
 * 		│ HTTP Simple Auth URL     │
 * 		▼                          │
 * 	┌───────────────────────┐      │
 * 	│ GitHub Actions Runner │      │
 * 	└───────────────────────┘      │
 * 		│                          │
 * 		│ HTTPS                    │
 * 		▼                          │
 * 	┌−−−−−−−−−−−−−−−−−−−−−−−−−−−┐  │ Docker Image
 * 	╎            VPC            ╎  │
 * 	╎                           ╎  │
 * 	╎ ┌───────────────────────┐ ╎  │
 * 	╎ │      ApiGateway       │ ╎  │
 * 	╎ └───────────────────────┘ ╎  │
 * 	╎   │                       ╎  │
 * 	╎   │ HTTP                  ╎  │
 * 	╎   ▼                       ╎  │
 * 	╎ ┌───────────────────────┐ ╎  │
 * 	╎ │          ALB          │ ╎  │
 * 	╎ └───────────────────────┘ ╎  │
 * 	╎   │                       ╎  │
 * 	╎   │ HTTP                  ╎  │
 * 	╎   ▼                       ╎  │
 * 	╎ ┌───────────────────────┐ ╎  │
 * 	╎ │          ECS          │ ╎ ◀┘
 * 	╎ └───────────────────────┘ ╎
 * 	╎   │                       ╎
 * 	╎   │ HTTP                  ╎
 * 	╎   ▼                       ╎
 * 	╎ ┌───────────────────────┐ ╎
 * 	╎ │  Bazel Remote Cache   │ ╎ ◀┐
 * 	╎ └───────────────────────┘ ╎  │
 * 	╎                           ╎  │
 * 	└−−−−−−−−−−−−−−−−−−−−−−−−−−−┘  │
 * 		▲                          │
 * 		│                          │ Cache Retrieval
 * 		│ Cache storage            │
 * 		▼                          │
 * 	┌───────────────────────┐      │
 * 	│          S3           │     ─┘
 * 	└───────────────────────┘
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';
import * as GitHub from '@pulumi/github';
import * as Pulumi from '@pulumi/pulumi';
import * as random from '@pulumi/random';
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

const deriveAWSRestrictedELBName = AWSIdentRestriction(32)(8)('-elb');

interface DockerFileParams {
	accessKey: string;
	s3Bucket: string;
}

const password_file_name = '.htpasswd';
const monorepo_github_name = '../zemn-me/monorepo';

function DockerFile(params: DockerFileParams) {
	return `
# Use a base image with Bazel and other dependencies
FROM buchgr/bazel-remote-cache:latest

# Set the user and group to 1000:1000
USER 1000:1000

# Set the working directory
WORKDIR /data

# Mount cache directory and AWS configuration from the host
VOLUME /data
VOLUME /aws-config

EXPOSE 80:8080

COPY ${password_file_name} ${password_file_name}

# Set the entry point and command
CMD [ \\
	"--s3.auth_method=aws_credentials_file", \\
	"--s3.aws_profile=supercool", \\
	"--s3.secret_access_key=${params.accessKey}", \\
	"--s3.bucket=${params.s3Bucket}", \\
	"--s3.endpoint=s3.us-east-1.amazonaws.com", \\
	"--htpasswd_file=${password_file_name}", \\
	"--http_address=8080", \\
	"--max_size", \\
	"5" \\
]


	`;
}

export class BazelRemoteCache extends Pulumi.ComponentResource {
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

		/**
		 * Content of the Dockerfile needed to turn up this service.
		 */
		const dockerFile = Pulumi.all([
			deployContextDirName,
			bucket.id,
			accessKey.secret,
		]).apply(([dir, bucketId, accessKey]) =>
			fs.writeFile(
				path.join(dir, 'Dockerfile'),
				DockerFile({ s3Bucket: bucketId, accessKey })
			)
		);

		/**
		 * Promise to the deploy directory that also ensures its contents are written.
		 */
		const deployContextDir = Pulumi.all([
			deployContextDirName,
			passwordFile,
			dockerFile,
		]).apply(([dirName]) => dirName);

		/**
		 * Cluster on which the cache service will run
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

		/**
		 * Load balancer for the cache service
		 */
		const loadBalancer = new awsx.lb.ApplicationLoadBalancer(
			deriveAWSRestrictedELBName(name),
			{
				listener: {
					protocol: 'HTTPS',
					certificateArn: certReq.validation.certificateArn,
					sslPolicy: 'ELBSecurityPolicy-2016-08',
				},
			},
			{ parent: this }
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
				path: deployContextDir,
			},
			{ parent: this }
		);

		/**
		 * The cache service itself on fargate.
		 */
		const service = new awsx.ecs.FargateService(
			`${name}_service`,
			{
				cluster: cluster.arn,
				assignPublicIp: true,
				// if we aren't using the cache for a while, it's cool to turn it down
				desiredCount: 1,
				deploymentMaximumPercent: 100,
				deploymentMinimumHealthyPercent: 0,
				taskDefinitionArgs: {
					container: {
						name: `${name}_container`,
						image: image.imageUri,
						cpu: 128,
						memory: 512,
						essential: true,
						portMappings: [
							{
								containerPort: 80,
								targetGroup: loadBalancer.defaultTargetGroup,
							},
						],
					},
				},
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

		new GitHub.ActionsSecret(
			`${name}_actions_secret_cache_url`,
			{
				plaintextValue: Pulumi.interpolate`https://${username.result}:${password.result}@${record.name}`,
				repository: monorepo_github_name,
				secretName: `BAZEL_REMOTE_CACHE_URL${
					args.stage ? '_staging' : ''
				}`,
			},
			{ parent: this, deleteBeforeReplace: true }
		);

		super.registerOutputs({ service, bucketPolicy });
	}
}
