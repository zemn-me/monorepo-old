import 'project/zemn.me/next/pages/base.css';

import type { AppProps } from 'next/app';
import Head from 'next/head';
import { HeaderTags } from 'ts/next.js';

export function App({ Component, pageProps }: AppProps) {
	return (
		<>
			<HeaderTags />
			<Component {...pageProps} />
			<Head>
				<link href="icon.svg" rel="icon" type="image/svg+xml" />
				<link
					href="icon.svg"
					rel="apple-touch-icon"
					type="image/svg+xml"
				/>
				<meta content="@zemnmez" name="twitter:site" />
				<meta content="@zemnnmez" name="twitter:creator" />
				<meta content="zemnmez" name="author" />
				<meta
					content="width=device-width,initial-scale=1,shrink-to-fit=no,viewport-fit=cover"
					name="viewport"
				/>
			</Head>
		</>
	);
}

export default App;
