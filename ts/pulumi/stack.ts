import fs from 'node:fs';
import path from 'node:path';

import * as Pulumi from '@pulumi/pulumi';
import { LocalWorkspace, Stack } from '@pulumi/pulumi/automation';
import * as monorepo from 'ts/pulumi';

// inject the pulumi binary into process.env; it is used by the pulumi automation API

const pulumi_dir = path.join(process.cwd(), 'ts/pulumi');
const pulumi_binary_path = path.join(pulumi_dir, 'pulumi');

process.env.PATH = [
	process.env.PATH,
	// the pulumi cli binary should be here
	pulumi_dir,
].join(':');

// for the github plugin
process.env['GITHUB_OWNER'] = 'zemn-me';

// check the binary is actually in there
if (!fs.existsSync(pulumi_binary_path)) {
	throw new Error('missing pulumi binary in ' + pulumi_dir);
}

export async function program() {
	require('ts/pulumi/index');
}

export const projectName = 'monorepo-2';

async function provisionStack(s: Promise<Stack>): Promise<Stack> {
	await (await s).workspace.installPlugin('aws', 'v5.13.0'); // can I get rid of this? it seems stupid
	await (await s).workspace.installPlugin('github', 'v5.17.0'); // can I get rid of this? it seems stupid
	await (await s).setConfig('aws:region', { value: 'us-east-1' });

	return s;
}

const baseComponentName = 'monorepo';

function handleErrorOutputs(v: Pulumi.Output<Error[]>) {
	return new Promise<void>((ok, err) =>
		v.apply(v => {
			if (v.length === 0) return ok();
			if (v.length === 1) return err(v[0]);
			err(new Error(v.map(v => `${v}`).join(';')));
		})
	);
}

export async function production(): Promise<Stack> {
	return provisionStack(
		LocalWorkspace.createOrSelectStack({
			stackName: 'prod',
			projectName,
			async program() {
				return handleErrorOutputs(
					new monorepo.Component(baseComponentName, {
						mocked: false,
						staging: false,
					}).done
				);
			},
		})
	);
}

export async function staging(): Promise<Stack> {
	return provisionStack(
		LocalWorkspace.createOrSelectStack({
			stackName: 'staging',
			projectName,
			async program() {
				return handleErrorOutputs(
					new monorepo.Component(baseComponentName, {
						mocked: false,
						staging: true,
					}).done
				);
			},
		})
	);
}
