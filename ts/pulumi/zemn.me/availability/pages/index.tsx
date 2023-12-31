/**
 * @fileoverview page to show my availability (for meetings etc)
 */

import Head from 'next/head';

const URL =
	'https://calendar.google.com/calendar/u/0/embed?src=thomas@shadwell.im&src=thomas@metatheory.gg&src=thomas.shadwell@gmail.com';

export default function HomePage() {
	return (
		<>
			<Head>
				<meta
					content="object-src https://calendar.google.com"
					httpEquiv="Content-Security-Policy"
				/>
				<title>Thomas’ Availability</title>
			</Head>
			<main>
				<p>
					Occasionally, the below frame can have trouble loading due
					to Google security checks. If that happens, please{' '}
					<a href={URL}>view on Google calendar</a> directly instead.
				</p>
				<iframe src={URL} />
			</main>
		</>
	);
}
