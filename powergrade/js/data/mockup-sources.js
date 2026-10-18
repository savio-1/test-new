/* Powergrade mockup sources: where to get free PSD/Figma mockups that a user can import into the app.
   None of these may be bundled into the published tool (redistribution:false for every one), so the
   app links out and lets each user download and import their own copy. Licences were read on each
   site in October 2026; see research/mockup-sources.md for quotes and caveats. Always re-check the
   licence on the individual download page: authors on directory sites set their own terms.
   Fields:
     formats          what the downloads usually are ('psd', 'figma', 'online' = browser editor only)
     smartObjects     true when the PSDs ship with smart objects (placed layers) the app can read with ag-psd
     internalTool     whether using downloaded mockups inside a private/internal tool is covered:
                      'yes' (any personal/commercial project), 'yes-attrib' (only with credit), 'unclear', 'no'
     redistribution   whether the source files may be redistributed or bundled (false for all)
*/
window.PG = window.PG || {};

PG.MOCKUP_SOURCES = [
  { name: 'Mockups-Design', url: 'https://mockups-design.com/', licenceUrl: 'https://mockups-design.com/license/',
    formats: ['psd', 'online'], smartObjects: true, internalTool: 'yes', redistribution: false,
    licenceSummary: 'Free for any purpose including commercial and client work, no attribution required. Source files (PSD/TIF) may not be redistributed in an open format or sold on stock sites; flattened results may be shared freely.',
    bestFor: ['packaging', 'print', 'outdoor', 'stationery', 'apparel'],
    notes: 'Clearest licence of the free sites and very large photographic catalogue (bottles, jars, boxes, pouches, cans, urban billboards and posters). Each PSD has a smart object per surface, ideal for ag-psd import.' },

  { name: 'GraphicBurger', url: 'https://graphicburger.com/mock-ups/', licenceUrl: 'https://graphicburger.com/license/',
    formats: ['psd'], smartObjects: true, internalTool: 'yes', redistribution: false,
    licenceSummary: 'Royalty free for personal and commercial projects for yourself or clients, no attribution needed. No reselling, sublicensing or redistributing the files, even for free; link to the resource page instead.',
    bestFor: ['branding', 'stationery', 'packaging', 'apparel'],
    notes: 'Item pages state "Format: Layered PSD / Smart Objects: Yes". Older catalogue, consistently clean studio shots.' },

  { name: 'Mockup Cloud (free section)', url: 'https://www.mockupcloud.com/free', licenceUrl: 'https://www.mockupcloud.com/license',
    formats: ['psd', 'online'], smartObjects: true, internalTool: 'yes', redistribution: false,
    licenceSummary: 'One licence covers free and paid items: unlimited end products for personal or commercial use; may not redistribute or sell the item itself, nor use it to make derivative mockups or templates. Single user, up to five devices.',
    bestFor: ['outdoor', 'branding', 'packaging', 'print', 'devices'],
    notes: 'Premium-quality photography (River Visual, Blank Studio and others). Free items include building billboards, art posters, ID badges, wall signage and coffee cups. Downloads are large (about 100 MB, 6000 px).' },

  { name: 'Mr.Mockup (free mockups)', url: 'https://mrmockup.com/free-mockups/', licenceUrl: 'https://mrmockup.com/licenses/',
    formats: ['psd'], smartObjects: true, internalTool: 'yes', redistribution: false,
    licenceSummary: 'Freebies are royalty free for personal and commercial use, no attribution. Cannot redistribute as stock, "in a tool or template" or with source files, as-is or modified, even for free.',
    bestFor: ['devices', 'packaging', 'outdoor', 'branding'],
    notes: 'The licence explicitly bars shipping the files inside a tool, so users must import their own downloads. Strong outdoor and coffee packaging freebies.' },

  { name: 'Pixeden (free section)', url: 'https://www.pixeden.com/psd-mock-up-templates', licenceUrl: 'https://www.pixeden.com/license',
    formats: ['psd'], smartObjects: true, internalTool: 'yes', redistribution: false,
    licenceSummary: 'Royalty free for personal and commercial projects, no attribution. Cannot redistribute, resell, sublicense or upload the resources anywhere, nor offer them as a separate attachment; no hotlinking.',
    bestFor: ['packaging', 'print', 'signage', 'stationery'],
    notes: 'Very consistent studio lighting and smart-object structure; most of the catalogue is premium, the free subset is smaller.' },

  { name: 'Unblast', url: 'https://unblast.com/psd-mockups/', licenceUrl: 'https://unblast.com/license/',
    formats: ['psd', 'figma', 'sketch'], smartObjects: true, internalTool: 'unclear', redistribution: false,
    licenceSummary: 'Items made by Unblast designers are free for personal and commercial use; many items are by third parties and carry their own licence. Files may not be hosted elsewhere; sharing must link to the Unblast page.',
    bestFor: ['apparel', 'devices', 'print', 'packaging'],
    notes: 'Large aggregator: check the licence line on every item. Category pages advertise "fully editable Photoshop templates featuring smart objects".' },

  { name: 'Mockup World', url: 'https://www.mockupworld.co/', licenceUrl: 'https://www.mockupworld.co/faq/',
    formats: ['psd', 'figma', 'online'], smartObjects: true, internalTool: 'unclear', redistribution: false,
    licenceSummary: 'A link directory that hosts nothing itself; each mockup links to its author, whose licence applies. Mockup World only lists items described as free for private and commercial use and asks you to re-check the licence on the final download page.',
    bestFor: ['devices', 'print', 'packaging', 'apparel', 'outdoor'],
    notes: 'Best discovery tool, not a licence. Treat every item as governed by its origin site.' },

  { name: 'LS Graphics (free mockups)', url: 'https://www.ls.graphics/free-mockups', licenceUrl: 'https://www.ls.graphics/terms-of-service',
    formats: ['psd', 'figma', 'online'], smartObjects: true, internalTool: 'yes', redistribution: false,
    licenceSummary: 'Products may be used in personal and commercial projects including client work. No redistribution, resale or sublicensing, no sharing source files or links publicly, and no inclusion in resalable apps, templates or software.',
    bestFor: ['devices', 'branding', 'outdoor', 'apparel'],
    notes: 'Strongest free device scenes (iPhone, MacBook) and Figma versions alongside PSD; "smart layers" throughout.' },

  { name: 'Free PSD Templates / MockupFree', url: 'https://free-psd-templates.com/', licenceUrl: 'https://free-psd-templates.com/license/',
    formats: ['psd'], smartObjects: true, internalTool: 'yes-attrib', redistribution: false,
    licenceSummary: 'Free with attribution: a link back for web or social use and a small "by Free-PSD-Templates.com" caption in print. Redistributing source files, even modified or for free, is strictly prohibited.',
    bestFor: ['print', 'outdoor', 'stationery', 'packaging'],
    notes: 'Attribution requirement makes it a poor default for client deliverables. Good roll-up banner, poster-wall and envelope scenes.' },

  { name: 'Freepik (now Magnific; includes Original Mockups)', url: 'https://www.freepik.com/mockups', licenceUrl: 'https://www.freepik.com/legal/terms-of-use',
    formats: ['psd', 'online'], smartObjects: true, internalTool: 'yes-attrib', redistribution: false,
    licenceSummary: 'Free content requires attribution to the site and author; a paid plan removes it. No reselling, sublicensing or redistributing content or derived works as such.',
    bestFor: ['packaging', 'print', 'apparel', 'branding', 'outdoor'],
    notes: 'originalmockups.com now redirects to freepik.com/mockups, and the Freepik terms page redirects to magnific.com. Site blocks automated access (403). Huge catalogue, uneven quality.' },

  { name: 'Rawpixel (free mockups)', url: 'https://www.rawpixel.com/', licenceUrl: 'https://www.rawpixel.com/services/licenses',
    formats: ['psd', 'png', 'online'], smartObjects: true, internalTool: 'yes', redistribution: false,
    licenceSummary: 'Free images and mockups need a free account and come under the Personal or Business licence; no selling or redistributing, and no adding them to any gallery, stock site or template where others can reuse them. Only items marked "Public Domain CC0" are free of these limits.',
    bestFor: ['print', 'apparel', 'packaging', 'devices'],
    notes: 'The CC0 public-domain photo collection is redistributable (used for nothing here because full-size downloads need an account); the mockup PSDs are not.' },

  { name: 'Pacdora', url: 'https://www.pacdora.com/', licenceUrl: 'https://www.pacdora.com/html/policy/en-US/terms-use.html',
    formats: ['online', 'png'], smartObjects: false, internalTool: 'yes', redistribution: false,
    licenceSummary: 'Online 3D mockup and dieline service: you may create designs for personal or commercial use within your plan; you may not copy, sell, sublicense or distribute the site\'s content or services.',
    bestFor: ['packaging'],
    notes: '3D packaging renders and dielines exported as images; no PSD smart objects to import. Free tier is limited and watermarked downloads depend on plan.' },

  { name: 'Figma Community', url: 'https://www.figma.com/community/mockups', licenceUrl: 'https://help.figma.com/hc/en-us/articles/360042296374',
    formats: ['figma'], smartObjects: false, internalTool: 'yes-attrib', redistribution: false,
    licenceSummary: 'Free files are CC BY 4.0 by default (share and adapt for any purpose, credit required); creators may add other terms. Paid files and plugins have restrictive Community licences.',
    bestFor: ['devices', 'print', 'branding'],
    notes: 'CC BY technically allows redistribution with credit, but the photos inside many community mockups come from other sites with stricter licences, so treat as not bundleable. Import via exported PNG + frame geometry, not ag-psd.' },

  { name: 'Anthony Boyd Graphics', url: 'https://www.anthonyboyd.graphics/', licenceUrl: 'https://www.anthonyboyd.graphics/license/',
    formats: ['psd'], smartObjects: true, internalTool: 'unclear', redistribution: false,
    licenceSummary: 'Unavailable: in October 2026 the domain redirects to minimalmockups.com, which shows only "Be back soon", so no licence could be read.',
    bestFor: ['devices', 'branding'],
    notes: 'Historically one of the best free device and branding PSD sources (smart objects, free for personal and commercial use, no redistribution). Re-check before linking.' }
];
