import '@pulumi/pulumi';
import 'ts/pulumi/setMocks';

import * as project from 'ts/pulumi';

describe('pulumi', () => {
	test('smoke', async () => {
		expect.assertions(1);
		await expect(
			new Promise<Error[]>((done, err) =>
				new project.Component('monorepo', {
					mocked: true,
					staging: false,
				}).done.apply(v => {
					try {
						done(v);
					} catch (e) {
						err(e);
					}
				})
			)
		).resolves.toHaveLength(0);
	});
});
