// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	integrations: [
		starlight({
			title: 'Majordom Docs',
			social: [],
			sidebar: [
				{
					label: 'Majordom Finance',
					items: [
						{ label: 'Getting Started', autogenerate: { directory: 'finance/getting-started' } },
						{ label: 'Concepts', autogenerate: { directory: 'finance/concepts' } },
						{ label: 'User Guide', autogenerate: { directory: 'finance/user-guide' } },
						{ label: 'Self-Hosting', autogenerate: { directory: 'finance/self-hosting' } },
						{ label: 'Reference', autogenerate: { directory: 'finance/reference' } },
					],
				},
				{
					label: 'Majordom Transport',
					items: [
						{ label: 'Getting Started', autogenerate: { directory: 'transport/getting-started' } },
						{ label: 'Concepts', autogenerate: { directory: 'transport/concepts' } },
						{ label: 'User Guide', autogenerate: { directory: 'transport/user-guide' } },
						{ label: 'Self-Hosting', autogenerate: { directory: 'transport/self-hosting' } },
						{ label: 'Reference', autogenerate: { directory: 'transport/reference' } },
					],
				},
				{
					label: 'Majordom Invest',
					items: [
						{ label: 'Getting Started', autogenerate: { directory: 'invest/getting-started' } },
						{ label: 'Concepts', autogenerate: { directory: 'invest/concepts' } },
						{ label: 'User Guide', autogenerate: { directory: 'invest/user-guide' } },
						{ label: 'Self-Hosting', autogenerate: { directory: 'invest/self-hosting' } },
						{ label: 'Reference', autogenerate: { directory: 'invest/reference' } },
					],
				},
			],
		}),
	],
});
