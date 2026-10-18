# Free mockup sources: licences and import notes

Researched October 2026 by visiting each site and reading its licence page in a headless browser. The machine-readable version is `js/data/mockup-sources.js` (`PG.MOCKUP_SOURCES`).

## Bottom line

- **None of these sources allows redistribution.** Every licence forbids re-hosting, reselling or sublicensing the source files, and several (Mr.Mockup, LS Graphics, Rawpixel) explicitly forbid putting them in a tool, template or app that others can use. So the published Powergrade build must not bundle any of their PSDs or preview images.
- **Using them inside a private tool is generally fine for the person who downloaded them.** The usual grant is "personal and commercial projects, including for clients". The safe pattern is for each user to download the PSD themselves and import it locally (ag-psd reads the smart-object transform). Do not share imported files across users or upload them to a shared server.
- **Flattened output is fine.** Mockups-Design states it directly: once the sample design is replaced and the result saved as a flat image, it can go to clients, portfolios, ads and social media. The other licences imply the same through "end products".
- **Attribution is needed for** Free PSD Templates, Freepik/Magnific on the free plan and Figma Community (CC BY 4.0). The rest need none.
- The bundled starter library (`js/data/mockups.js`) uses only CC0, public-domain and Unsplash-licence photos for this reason.

## Sources

| Source | Formats | Smart objects | Internal tool | Redistribute | Licence in one line |
|---|---|---|---|---|---|
| [Mockups-Design](https://mockups-design.com/license/) | PSD, online editor | Yes | Yes | No (no open PSD/TIF) | Any use, commercial and clients, no attribution; flattened results may be shared. |
| [GraphicBurger](https://graphicburger.com/license/) | PSD | Yes ("Smart Objects: Yes" on items) | Yes | No, even for free | Royalty free, personal and commercial, no attribution. |
| [Mockup Cloud](https://www.mockupcloud.com/license) (free section) | PSD, online | Yes | Yes | No | Unlimited end products; no reselling the item; no making derivative mockups/templates; single user, five devices. |
| [Mr.Mockup](https://mrmockup.com/licenses/) | PSD | Yes | Yes | No, "in a tool or template" explicitly barred | Freebies royalty free for personal and commercial use. |
| [Pixeden](https://www.pixeden.com/license) | PSD | Yes | Yes | No; no hotlinking | Royalty free, no attribution. |
| [Unblast](https://unblast.com/license/) | PSD, Figma, Sketch | Mostly | Check each item | No direct hosting | Own items free for commercial use; third-party items carry their own licence. |
| [Mockup World](https://www.mockupworld.co/faq/) | Directory | Varies | Per author | Per author (never) | A link directory; the original author's licence applies. |
| [LS Graphics](https://www.ls.graphics/terms-of-service) | PSD, Figma | Yes ("smart layers") | Yes | No; not in resalable software | Personal and commercial, including clients. |
| [Free PSD Templates](https://free-psd-templates.com/license/) | PSD | Yes | Yes, with credit | Strictly no | Requires attribution (link online, caption in print). |
| [Freepik / Magnific](https://www.freepik.com/legal/terms-of-use) (includes Original Mockups) | PSD, online | Yes | Yes, with credit on the free plan | No | Free use conditioned on attribution; a paid plan removes it. |
| [Rawpixel](https://www.rawpixel.com/services/licenses) | PSD, PNG | Yes | Yes | No; not in any template or gallery | Free account, Personal or Business licence; only CC0-labelled images are unrestricted. |
| [Pacdora](https://www.pacdora.com/html/policy/en-US/terms-use.html) | Online 3D, PNG export | No (renders) | Yes | No | Make designs for personal or commercial use per plan; no distributing site content. |
| [Figma Community](https://help.figma.com/hc/en-us/articles/360042296374) | Figma | No (frames) | Yes, with credit | CC BY allows it, but embedded photos are often third-party | Free files are CC BY 4.0 by default. |
| [Anthony Boyd Graphics](https://www.anthonyboyd.graphics/) | PSD | Yes (historically) | Unknown | No (historically) | Site currently redirects to minimalmockups.com ("Be back soon"); no licence to read. |

## Key licence wording

- **Mockups-Design**: "This license allows for the use of Mockups ... for any purpose, including commercial purposes ... You may not distribute Mockup files ... in an open format, such as PSD ... After modifying ... and saving the Mockup as a flattened graphic file, further distribution in this form is permitted."
- **GraphicBurger**: "royalty free to use in both personal and commercial projects ... You do not have the rights to resell, sublicense or redistribute (even for free) the files on its own or as a separate attachment from any of your work."
- **Mockup Cloud**: "You are licensed to use the Item to create unlimited End Products for personal and/or commercial usage ... You are not allowed to sell or redistribute the purchased item as a stock image ... Use our scene creator products to create derivative digital products such as mockups or templates [is prohibited]." The free items sit under the same licence ("Extended License Details" on each freebie page).
- **Mr.Mockup**: "All our freebie products are royalty free for use in both personal and commercial projects ... You can't re-distribute our products as stock, in a tool or template, or with source files ... even if the re-distribution is for free."
- **Pixeden**: "You cannot however redistribute, resell, lease, license, sub-license or offer our resources to any third party. This includes uploading our resources to another website ... No HOTLINKING is allowed."
- **Unblast**: "Resources crafted by our own designers are all free for personal & commercial use ... You can't host the download files directly on your site unless you get permission from us." Third-party items: "We mention the license for each resource as specified by the author."
- **Mockup World**: "The site does not host any resources itself but works as a curated directory ... please double-check the license on the final download page."
- **LS Graphics**: "You may use Products in your personal and commercial projects, including projects for clients. You may not redistribute, resell, lease, license, sublicense ... You may not include Products as attachments in resalable web applications, templates, frameworks, or software programs."
- **Free PSD Templates**: attribution "by Free-PSD-Templates.com" in print and a link online; "Redistribute SOURCE FILES of our templates ... even in a modified form ... It's strongly prohibited!"
- **Freepik / Magnific**: "authorization to use [the] Content is free of charge and conditioned upon any use by the User being duly attributed"; the user "does not resell, assign, transfer or sublicense the ... Content or any derived work".
- **Rawpixel**: Business licence allows "any business purpose as long as you are not selling or redistributing our images ... you must not add our images to any image gallery, stock image site or template where users are able to access our images". Images labelled "Free Public Domain CC0 Image" are under CC0.
- **Figma Community**: "Free files are published under an Attribution 4.0 International (CC BY 4.0) license ... Community members need to give credit to the original creator."

## Which sources ship smart objects (for the ag-psd importer)

Mockups-Design, GraphicBurger, Mockup Cloud, Mr.Mockup, Pixeden, LS Graphics, Free PSD Templates, Unblast (own items), Freepik and Rawpixel PSDs all use one smart object per brandable surface. ag-psd exposes these as layers with `placedLayer` (its `transform` holds the eight numbers of the four corners, and `nonAffineTransform` holds the warp when the surface is perspective-distorted), plus the linked or embedded source in `psd.linkedFiles`. Notes for the importer:

- Prefer `placedLayer.nonAffineTransform` when present; it is the true quad. Fall back to `transform`.
- Curved surfaces (cups, cans, bottles) often add a warp (`placedLayer.warp`) on top of the quad; read its mesh or approximate it with the `curve` value used in `mockups.js`.
- Shadows and highlights normally sit on layers above the smart object in Multiply or Screen mode. Composite them over the warped artwork to keep the photo's shading.
- Pacdora (renders) and Figma Community (frames) do not ship PSD smart objects.

## Best five for Powergrade users

1. **Mockups-Design**: the clearest licence, the largest photographic packaging and urban set, and one smart object per surface.
2. **GraphicBurger**: clean studio stationery and branding scenes, licence is plain and needs no credit.
3. **Mockup Cloud (free section)**: the most premium-looking free photography, with outdoor scenes such as billboards and wall signs.
4. **LS Graphics (free)**: the best free device scenes, in both PSD and Figma.
5. **Pixeden (free)**: consistent studio lighting, packaging and signage, and a no-attribution licence.
