import program from './program';

test('deploy', async () => {
	process.env.NPM_TOKEN = '123fake';
	await program.parseAsync(['--dryRun', 'true']);
});
