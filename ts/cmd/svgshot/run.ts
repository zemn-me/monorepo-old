#!/usr/bin/env node

/**
 * @fileoverview The main entry point for svgshot.
 *
 * Svgshot is separated out into a lib to allow easier testing.
 *
 * I wouldn't worry about it too much.
 */

import main from './lib';

main()
	.then(() => process.exit(0))
	.catch(e => {
		console.error(e);
		process.exit(1);
	});
