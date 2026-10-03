/**
 * Application Identity (Brand)
 *
 * Also note that the 'Brand' is used in the following places:
 *  - README.md               all over
 *  - package.json            app-slug and version
 *  - [public/manifest.json]  name, short_name, description, theme_color, background_color
 */
export const Brand = {
  Title: {
    Base: 'Sector 7',
    Common: (process.env.NODE_ENV === 'development' ? '[DEV] ' : '') + 'Sector 7',
  },
  Meta: {
    Description: 'Your local Claude workspace with projects, folder context and a neon night interface.',
    SiteName: 'Sector 7',
    ThemeColor: '#060F14',
    TwitterSite: '',
  },
  URIs: {
    Home: 'https://github.com/AdriaanVE/sector-7',
    // App: 'https://get.big-agi.com',
    CardImage: '',
    OpenRepo: 'https://github.com/AdriaanVE/sector-7',
    OpenProject: 'https://github.com/users/enricoros/projects/4',
    SupportInvite: 'https://discord.gg/MkH4qj2Jp9',
    // Twitter: 'https://x.com/enricoros',
    PrivacyPolicy: 'https://big-agi.com/privacy',
    TermsOfService: 'https://big-agi.com/terms',
  },
  Docs: {
    Public: (docPage: string) => `https://big-agi.com/docs/${docPage}`,
  }
} as const;
