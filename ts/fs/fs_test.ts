import * as fs from 'ts/fs';
import * as iter from 'ts/iter';

describe('fs', () => {
	describe('walk', () => {
		it('should see all the expected files.', async () => {
			const e = (await iter.unroll(fs.walk('ts/fs/testfiles/walk_base')))
				.map(([, getPath]) => getPath())
				.sort();

			const [a, b, c] = e;

			expect(a.endsWith('ts/fs/testfiles/walk_base')).toBe(true);

			expect(b.endsWith('ts/fs/testfiles/walk_base/a.txt')).toBe(true);
			expect(c.endsWith('ts/fs/testfiles/walk_base/b.txt')).toBe(true);
		});
	});
});
