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
						{ label: 'Getting Started', items: [{ autogenerate: { directory: 'finance/getting-started' } }] },
						{ label: 'Concepts', items: [{ autogenerate: { directory: 'finance/concepts' } }] },
						{ label: 'User Guide', items: [{ autogenerate: { directory: 'finance/user-guide' } }] },
						{ label: 'Self-Hosting', items: [{ autogenerate: { directory: 'finance/self-hosting' } }] },
						{ label: 'Reference', items: [{ autogenerate: { directory: 'finance/reference' } }] },
					],
				},
				{
					label: 'Majordom Transport',
					items: [
						{ label: 'Getting Started', items: [{ autogenerate: { directory: 'transport/getting-started' } }] },
						{ label: 'Concepts', items: [{ autogenerate: { directory: 'transport/concepts' } }] },
						{ label: 'User Guide', items: [{ autogenerate: { directory: 'transport/user-guide' } }] },
						{ label: 'Self-Hosting', items: [{ autogenerate: { directory: 'transport/self-hosting' } }] },
						{ label: 'Reference', items: [{ autogenerate: { directory: 'transport/reference' } }] },
					],
				},
				{
					label: 'Majordom Invest',
					items: [
						{ label: 'Getting Started', items: [{ autogenerate: { directory: 'invest/getting-started' } }] },
						{ label: 'Concepts', items: [{ autogenerate: { directory: 'invest/concepts' } }] },
						{ label: 'User Guide', items: [{ autogenerate: { directory: 'invest/user-guide' } }] },
						{ label: 'Self-Hosting', items: [{ autogenerate: { directory: 'invest/self-hosting' } }] },
						{ label: 'Reference', items: [{ autogenerate: { directory: 'invest/reference' } }] },
					],
				},
			],
		}),
	],
});
