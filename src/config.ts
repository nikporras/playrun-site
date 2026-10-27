// Site-wide constants. Everything the pages need to know about the site lives here.
export const site = {
  name: 'PlayRun',
  tagline: 'test experts',
  url: 'https://playrunqa.com',
  description:
    'PlayRun is the game QA portfolio of Nicolás Porras in London: game QA, platform compliance and release testing since 2021, on Nintendo Switch, Xbox, PS5 and the PC stores, with reports developers can act on.',
  locale: 'en_GB',
  themeColor: '#0C152A',
};

export const contact = {
  name: 'Nicolás Porras',
  email: 'studio@playrunqa.com',
  phone: '+44 7830 303383',
  phoneHref: 'tel:+447830303383',
  location: 'London, UK',
};

// The contact form posts a JSON string to this Google Apps Script web app (text/plain body, so
// there is no CORS preflight). It answers {ok:true} or {ok:false, errors:[...]}.
export const contactEndpoint =
  'https://script.google.com/macros/s/AKfycbxuVMg4V94B0QBAu-bLOox8zFTYRgZgWnPRiilkS7Sl0qt7w_R8dYw3gts3sy6Mk5CYMQ/exec';

// Studio links for the footer. A link is rendered only when its URL is set.
export const social: { label: string; href: string }[] = [
  { label: 'LinkedIn', href: 'https://www.linkedin.com/company/109504089/' },
  { label: 'GitHub', href: '' },
].filter((s) => s.href !== '');

// Nicolás's own profiles, for the About page.
export const personal = {
  linkedin: 'https://www.linkedin.com/in/nicolas-porras-918774116/',
};

export const nav = [
  { label: 'Skills', href: '/skills' },
  { label: 'Portfolio', href: '/portfolio' },
  { label: 'About', href: '/about' },
  { label: 'Quality', href: '/quality' },
  { label: 'Contact', href: '/contact' },
];

export const primaryAction = { label: 'Get in touch', href: '/contact' };

// Legal pages. Put the business address in `address` when there is one to show; while it is
// empty the pages fall back to the location in `contact`.
export const legal = {
  controller: 'Nicolás Porras (PlayRun)',
  address: '',
  updated: '2026-10-27',
};

export const legalNav = [
  { label: 'Privacy', href: '/privacy' },
  { label: 'Terms', href: '/terms' },
  { label: 'Accessibility', href: '/accessibility' },
];
