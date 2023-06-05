import fs from 'node:fs';
import path from 'node:path';

import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import mime from 'mime';
import * as guard from 'ts/guard';

function relative(from: string, to: string): string {
	const f = path.normalize(from),
		t = path.normalize(to);

	if (!t.startsWith(f)) {
		// try to remove as much of the prefix as possible.

		const [tl, fl] = [[...t], [...f]];

		let ctr = 0;

		for (; tl[ctr] === fl[ctr]; ctr++);

		let errorMessage = `Cannot make ${t} relative to ${f}; ${t} does not start with ${f}.`;

		errorMessage += `The issue starts after '${tl.slice(ctr).join('')}'.`;

		throw new Error(errorMessage);
	}

	return t.slice(f.length);
}

export interface Args {
	/**
	 * Zone to create any needed DNS records in.
	 */
	zone: aws.route53.Zone;

	/**
	 * The domain or subdomain itself within the zone to create the website.
	 *
	 * Leave undefined to host at the root of the domain
	 *
	 * @example
	 * "mywebsite.com."
	 */
	subDomain: string | undefined;

	/**
	 * A directory to upload to the S3 bucket.
	 */
	directory: string;

	/**
	 * The index document to serve.
	 */
	index: string;

	/**
	 * The 404 document to serve.
	 */
	notFound?: string;
}

const second = 1;
const minute = 60 * second;

/**
 * Provisions an S3 Bucket, CloudFront instance and certificate
 * to serve a static website.
 */
export class Website extends pulumi.ComponentResource {
	constructor(
		name: string,
		args: Args,
		opts?: pulumi.ComponentResourceOptions
	) {
		super('ts:pulumi:lib:Website', name, args, opts);

		const cert = new aws.acm.Certificate(`${name}_cert`, {
			domainName: args.subDomain,
			validationMethod: 'DNS',
		});

		const validatingRecord = new aws.route53.Record(
			`${name}_validating_record`,
			{
				name: cert.domainValidationOptions[0].resourceRecordName,
				records: [cert.domainValidationOptions[0].resourceRecordValue],
				type: cert.domainValidationOptions[0].resourceRecordType,
				zoneId: args.zone.zoneId,
				ttl: 1 * minute, // because these really don't need to be cached
			}
		);

		const validation = new aws.acm.CertificateValidation(
			`${name}_validation`,
			{
				certificateArn: cert.arn,
				validationRecordFqdns: [validatingRecord.fqdn],
			}
		);

		const indexDocument = relative(args.directory, args.index);
		const errorDocument = args.notFound
			? relative(args.directory, args.notFound)
			: undefined;

		const bucket = new aws.s3.Bucket(`${name}_bucket`, {
			acl: 'public-read',
			website: {
				indexDocument,
				errorDocument,
			},
		});

		// upload files

		const uploadDir = (dir: string): Map<string, aws.s3.BucketObject> => {
			let out: Map<string, aws.s3.BucketObject> = new Map();
			for (const item of fs.readdirSync(dir)) {
				/**
				 * The absolute path on disk.
				 */
				const fPath = path.join(dir, item);

				const fileInfo = fs.lstatSync(fPath);

				if (fileInfo.isDirectory()) {
					out = new Map([...out, ...uploadDir(fPath)]);
					continue;
				}

				out.set(
					fPath,
					new aws.s3.BucketObject(`${name}_bucket_file_${fPath}`, {
						key: relative(args.directory, fPath),
						bucket: bucket.id,
						contentType: guard.must(
							guard.isNotNull,
							() => `couldn't get contentType of ${fPath}`
						)(mime.getType(fPath)),
						source: fPath,
						acl: 'public-read',
					})
				);
			}

			return out;
		};

		const objects = uploadDir(args.directory);

		const errorDocumentObject = args.notFound
			? guard.must(
					guard.isDefined,
					() =>
						`Cannot find ${args.notFound} in [${[
							...objects.keys(),
						].join(', ')}]`
			  )(objects.get(args.notFound))
			: undefined;
		const indexDocumentObject = guard.must(
			guard.isDefined,
			() =>
				`Cannot find ${args.index} in [${[...objects.keys()].join(
					', '
				)}]`
		)(objects.get(args.index));

		// create the cloudfront

		/**
		 * The final subdomain that the website can be loaded from on the target domain.
		 */
		const targetDomain = args.zone.name.apply(zoneName =>
			[args.subDomain, zoneName].filter(guard.isDefined).join('.')
		);

		const distribution = new aws.cloudfront.Distribution(
			`${name}_cloudfront_distribution`,
			{
				origins: [
					{
						domainName: bucket.bucketRegionalDomainName,
						originId: `${name}_cloudfront_distribution`,
					},
				],
				enabled: true,
				isIpv6Enabled: true,
				defaultRootObject: indexDocumentObject.key,
				// this is the host that the distribution will expect
				// (other than the default).
				aliases: [targetDomain],
				// in the future we could maybe take a bunch of these as args, but
				// we're not overengineering today!
				// im sorry this bit kinda sucks
				...(errorDocumentObject !== undefined
					? {
							customErrorResponses: [
								{
									errorCode: 404,
									responseCode: 404,
									responsePagePath: errorDocumentObject.key,
								},
							],
					  }
					: {}),
				defaultCacheBehavior: {
					// i dont think we use most of these but it's probably not
					// important
					allowedMethods: [
						'DELETE',
						'GET',
						'HEAD',
						'OPTIONS',
						'PATCH',
						'POST',
						'PUT',
					],
					cachedMethods: ['GET', 'HEAD'],
					// i'm fairly sure this is correct, but the docs kinda suck
					// on which of AWS's many IDs this might be and sapling histgrep
					// is broken.
					targetOriginId: bucket.id,
					forwardedValues: {
						queryString: false,
						// I'm not using cookies for anything yet.
						// and to be honest, i prefer localStorage.
						cookies: {
							forward: 'none',
						},
					},
					viewerProtocolPolicy: 'redirect-to-https',
					minTtl: 0,
					defaultTtl: 3600,
					maxTtl: 86400,
				},
				restrictions: {
					geoRestriction: {
						restrictionType: 'none',
					},
				},
				tags: {
					Environment: 'production',
				},
				viewerCertificate: {
					// important to use this so that it waits for the cert
					// to come up
					acmCertificateArn: validation.certificateArn,
					sslSupportMethod: 'sni-only', // idk really what this does
				},
			}
		);

		// create the alias record that allows the distribution to be located
		// from the DNS record.

		const record = new aws.route53.Record(`${name}_distribution_record`, {
			zoneId: args.zone.id,
			name: targetDomain,
			type: 'A',
			ttl: 300,
			aliases: [
				{
					name: distribution.domainName,
					zoneId: distribution.hostedZoneId,
					evaluateTargetHealth: true,
				},
			],
		});

		this.registerOutputs({
			distribution,
			record,
		});
	}
}

export default Website;
