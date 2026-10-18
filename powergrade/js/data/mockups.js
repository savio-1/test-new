/* Powergrade mockup photo library: real photographs of blank, brandable surfaces.
   Every photo may be redistributed with the tool: CC0 1.0 (Wikimedia Commons uploads, ISO Republic,
   Negative Space, WordPress Photo Directory), Public domain, or the Unsplash License (via Picsum).
   Credits are kept for good practice. A few photos were retouched to remove small product or brand marks.
   Files: assets/mockups/<id>.jpg (max 2400 px long side) and assets/mockups/thumb/<id>.jpg (600 px).
   Surfaces:
     quad    four corners [x,y] in the exported image's pixels, in design order:
             top-left, top-right, bottom-right, bottom-left (map with a homography, not an affine).
     aspect  intended design width / height for the surface.
     curve   0..1 horizontal cylindrical bulge for cups, cans, jars and columns. The quad is the
             projected outline; map design x through u = (sin((2s-1)*c*PI/2)/sin(c*PI/2)+1)/2.
     blend   'multiply' for light surfaces so the photo's shading shows through;
             'normal' for dark or already-printed surfaces: draw the artwork, then lay a shading
             overlay (the photo's luminance, softly) on top.
     role    which artwork the app should place: billboard, poster, sign, flag, card-front, card-back,
             letterhead, cover, spread, box-front, box-side, label, wrap, tote, bag, tee, cap,
             screen-phone, screen-laptop, screen-tablet, id-card, vehicle, wall.
   Every quad was checked by warping a test grid with an orientation marker into it.
*/
window.PG = window.PG || {};

PG.MOCKUP_PHOTOS = [
  { id:'bus-shelter-city', file:'assets/mockups/bus-shelter-city.jpg', thumb:'assets/mockups/thumb/bus-shelter-city.jpg', w:1920, h:1280,
    category:'outdoor', name:'City bus shelter with lit poster case',
    surfaces:[
      { id:'poster', quad:[[834,316],[1135,331],[1132,828],[834,851]], aspect:0.667, curve:0.0, blend:'normal', role:'poster' },
      { id:'side', quad:[[625,186],[765,197],[765,868],[625,868]], aspect:0.2, curve:0.0, blend:'normal', role:'sign' }
    ],
    credit:{ author:'Retired electrician', source:'Wikimedia Commons', license:'CC0 1.0', url:'https://commons.wikimedia.org/wiki/File:Moscow,_1st_Botkinsky_bus_stop_Aug_2024_06.jpg' },
    notes:'Existing poster and the side-panel stop name are fully covered by the two surfaces; use normal blend.' },
  { id:'column-advertising', file:'assets/mockups/column-advertising.jpg', thumb:'assets/mockups/thumb/column-advertising.jpg', w:1280, h:2092,
    category:'outdoor', name:'Dark advertising column (Litfaßsäule) by a building',
    surfaces:[
      { id:'wrap', quad:[[373,570],[907,570],[907,1543],[373,1543]], aspect:0.78, curve:0.9, blend:'normal', role:'poster' }
    ],
    credit:{ author:'Singlespeedfahrer', source:'Wikimedia Commons', license:'CC0 1.0', url:'https://commons.wikimedia.org/wiki/File:Litfass%C3%A4ule_M%C3%BCllerstra%C3%9Fe_Berlin.jpg' },
    notes:'Cylindrical: the wrap uses curve 0.9; dark surface, use normal blend with a shading overlay.' },
  { id:'van-white-side', file:'assets/mockups/van-white-side.jpg', thumb:'assets/mockups/thumb/van-white-side.jpg', w:1920, h:1377,
    category:'outdoor', name:'White panel van, side profile on a city street',
    surfaces:[
      { id:'panel', quad:[[725,455],[1490,450],[1490,800],[725,805]], aspect:2.19, curve:0.0, blend:'multiply', role:'vehicle' }
    ],
    credit:{ author:'Retired electrician', source:'Wikimedia Commons', license:'CC0 1.0', url:'https://commons.wikimedia.org/wiki/File:Moscow,_Peugeot_Expert_white_van_July_2025_03.jpg' },
    notes:'Rear badges and number plate retouched out.' },
  { id:'frames-cafe-wall', file:'assets/mockups/frames-cafe-wall.jpg', thumb:'assets/mockups/thumb/frames-cafe-wall.jpg', w:1600, h:2400,
    category:'interior', name:'Three framed prints above a café banquette',
    surfaces:[
      { id:'print-left', quad:[[134,787],[408,795],[404,1161],[128,1163]], aspect:0.74, curve:0.0, blend:'normal', role:'poster' },
      { id:'print-centre', quad:[[704,808],[946,826],[943,1162],[697,1162]], aspect:0.72, curve:0.0, blend:'normal', role:'poster' },
      { id:'print-right', quad:[[1197,852],[1405,853],[1400,1165],[1195,1166]], aspect:0.67, curve:0.0, blend:'normal', role:'poster' }
    ],
    credit:{ author:'The Anchor', source:'Unsplash via Picsum', license:'Unsplash License', url:'https://unsplash.com/photos/6hgsktgpfIE' },
    notes:'Glazed frames over dark existing prints: normal blend with a light glass sheen.' },
  { id:'poster-dark-wall', file:'assets/mockups/poster-dark-wall.jpg', thumb:'assets/mockups/thumb/poster-dark-wall.jpg', w:1800, h:2400,
    category:'interior', name:'Framed poster on a charcoal wall',
    surfaces:[
      { id:'print', quad:[[650,878],[1150,875],[1150,1625],[612,1627]], aspect:0.68, curve:0.0, blend:'normal', role:'poster' }
    ],
    credit:{ author:'season321', source:'WordPress Photo Directory', license:'CC0 1.0', url:'https://wordpress.org/photos/photo/153679783a/' },
    notes:'Existing poster is replaced: normal blend.' },
  { id:'wall-living-room', file:'assets/mockups/wall-living-room.jpg', thumb:'assets/mockups/thumb/wall-living-room.jpg', w:2400, h:1600,
    category:'interior', name:'Bare white living-room wall above a sofa',
    surfaces:[
      { id:'wall', quad:[[140,140],[860,140],[860,860],[140,860]], aspect:1.0, curve:0.0, blend:'multiply', role:'wall' }
    ],
    credit:{ author:'Kristin Hardwick', source:'ISO Republic', license:'CC0 1.0', url:'https://isorepublic.com/photo/house-plant-interior/' },
    notes:'Free wall area for a print, mural or wall sign; no frame in the photo.' },
  { id:'clipboard-letterhead', file:'assets/mockups/clipboard-letterhead.jpg', thumb:'assets/mockups/thumb/clipboard-letterhead.jpg', w:1920, h:2400,
    category:'print', name:'Blank A4 sheet on a wooden clipboard',
    surfaces:[
      { id:'sheet', quad:[[470,645],[1467,645],[1462,1898],[468,1893]], aspect:0.8, curve:0.0, blend:'multiply', role:'letterhead' }
    ],
    credit:{ author:'Design by Matt', source:'Negative Space', license:'CC0 1.0', url:'https://negativespace.co/clipboard-desk-top/' },
    notes:'Top margin starts below the clip.' },
  { id:'notebook-map-vintage', file:'assets/mockups/notebook-map-vintage.jpg', thumb:'assets/mockups/thumb/notebook-map-vintage.jpg', w:1920, h:1440,
    category:'print', name:'Open notebook on a vintage map with camera',
    surfaces:[
      { id:'spread', quad:[[660,632],[1344,625],[1366,1080],[660,1080]], aspect:1.414, curve:0.0, blend:'multiply', role:'spread' }
    ],
    credit:{ author:'Dariusz Sankowski', source:'Wikimedia Commons', license:'CC0 1.0', url:'https://commons.wikimedia.org/wiki/File:Dariusz_Sankowski_2016_(Unsplash).jpg' },
    notes:'Warm, dark grade; a pencil crosses the right page.' },
  { id:'notebook-spread-flatlay', file:'assets/mockups/notebook-spread-flatlay.jpg', thumb:'assets/mockups/thumb/notebook-spread-flatlay.jpg', w:2400, h:1602,
    category:'print', name:'Spiral notebook page on white wood, flat lay',
    surfaces:[
      { id:'page', quad:[[526,289],[1651,14],[1929,1178],[831,1454]], aspect:0.96, curve:0.0, blend:'multiply', role:'letterhead' }
    ],
    credit:{ author:'Artsy Crafty', source:'ISO Republic', license:'CC0 1.0', url:'https://isorepublic.com/photo/notebook-desk-above/' },
    notes:'A pen lies across the page; it will tint with multiply.' },
  { id:'notebook-white-desk', file:'assets/mockups/notebook-white-desk.jpg', thumb:'assets/mockups/thumb/notebook-white-desk.jpg', w:1920, h:1280,
    category:'print', name:'Open notebook spread on a white desk',
    surfaces:[
      { id:'spread', quad:[[555,533],[1301,442],[1441,986],[598,1114]], aspect:1.34, curve:0.0, blend:'multiply', role:'spread' }
    ],
    credit:{ author:'JESHOOTS.COM', source:'Wikimedia Commons', license:'CC0 1.0', url:'https://commons.wikimedia.org/wiki/File:White_work_table_with_notes,_smartphone_and_laptop_(Unsplash).jpg' } },
  { id:'notebook-yellow-flatlay', file:'assets/mockups/notebook-yellow-flatlay.jpg', thumb:'assets/mockups/thumb/notebook-yellow-flatlay.jpg', w:2000, h:2275,
    category:'print', name:'Spiral notebook cover on a yellow background',
    surfaces:[
      { id:'cover', quad:[[300,886],[942,884],[921,1800],[310,1810]], aspect:0.68, curve:0.0, blend:'multiply', role:'cover' }
    ],
    credit:{ author:'soycelycruz', source:'WordPress Photo Directory', license:'CC0 1.0', url:'https://wordpress.org/photos/photo/20364711f1/' } },
  { id:'notepad-desk-pen', file:'assets/mockups/notepad-desk-pen.jpg', thumb:'assets/mockups/thumb/notepad-desk-pen.jpg', w:2400, h:1800,
    category:'print', name:'Spiral notepad with pen on a wooden desk',
    surfaces:[
      { id:'page', quad:[[46,803],[1390,500],[2183,848],[736,1356]], aspect:1.414, curve:0.0, blend:'multiply', role:'cover' }
    ],
    credit:{ author:'FOCA Stock', source:'Negative Space', license:'CC0 1.0', url:'https://negativespace.co/workspace-office-business/' },
    notes:'A pen lies on the pad.' },
  { id:'paper-laptop-desk', file:'assets/mockups/paper-laptop-desk.jpg', thumb:'assets/mockups/thumb/paper-laptop-desk.jpg', w:1920, h:1280,
    category:'print', name:'Blank sheet beside a laptop on a grey oak desk',
    surfaces:[
      { id:'sheet', quad:[[1328,610],[1750,984],[766,1428],[514,874]], aspect:0.707, curve:0.0, blend:'multiply', role:'letterhead' }
    ],
    credit:{ author:'Markus Spiske', source:'Wikimedia Commons', license:'CC0 1.0', url:'https://commons.wikimedia.org/wiki/File:Clean_slate_(Unsplash).jpg' },
    notes:'Sheet is seen in steep perspective; quad TL is the far corner.' },
  { id:'sketchbook-paints', file:'assets/mockups/sketchbook-paints.jpg', thumb:'assets/mockups/thumb/sketchbook-paints.jpg', w:1920, h:1146,
    category:'print', name:'Spiral sketchbook beside watercolours on rustic wood',
    surfaces:[
      { id:'page', quad:[[995,140],[1665,145],[1663,1010],[1000,1013]], aspect:0.77, curve:0.0, blend:'multiply', role:'cover' }
    ],
    credit:{ author:'Tim Arterbury', source:'Wikimedia Commons', license:'CC0 1.0', url:'https://commons.wikimedia.org/wiki/File:A_notebook_with_paint_brushes.jpg' } },
  { id:'bags-kraft-row', file:'assets/mockups/bags-kraft-row.jpg', thumb:'assets/mockups/thumb/bags-kraft-row.jpg', w:1600, h:2400,
    category:'packaging', name:'Row of kraft paper shopping bags',
    surfaces:[
      { id:'front', quad:[[812,997],[1433,995],[1435,1913],[808,1925]], aspect:0.68, curve:0.0, blend:'multiply', role:'bag' }
    ],
    credit:{ author:'Nilo Velez', source:'WordPress Photo Directory', license:'CC0 1.0', url:'https://wordpress.org/photos/photo/6677d6653b/' } },
  { id:'cup-latte-cafe', file:'assets/mockups/cup-latte-cafe.jpg', thumb:'assets/mockups/thumb/cup-latte-cafe.jpg', w:2400, h:1953,
    category:'packaging', name:'Kraft takeaway cup with latte in a café',
    surfaces:[
      { id:'sleeve', quad:[[1120,1175],[1780,1185],[1735,1405],[1150,1395]], aspect:3.4, curve:0.6, blend:'multiply', role:'wrap' }
    ],
    credit:{ author:'Kristin Hardwick', source:'ISO Republic', license:'CC0 1.0', url:'https://isorepublic.com/photo/latte-art/' },
    notes:'Curved sleeve band.' },
  { id:'cup-red-ripple', file:'assets/mockups/cup-red-ripple.jpg', thumb:'assets/mockups/thumb/cup-red-ripple.jpg', w:1800, h:2400,
    category:'packaging', name:'Red ripple-wall takeaway cup with latte art',
    surfaces:[
      { id:'wrap', quad:[[479,700],[1085,700],[1017,1150],[567,1150]], aspect:1.4, curve:0.645, blend:'normal', role:'wrap' }
    ],
    credit:{ author:'Bigul Malayi', source:'WordPress Photo Directory', license:'CC0 1.0', url:'https://wordpress.org/photos/photo/28568efbed/' },
    notes:'Coloured cup: normal blend with a shading overlay.' },
  { id:'jar-candle-label', file:'assets/mockups/jar-candle-label.jpg', thumb:'assets/mockups/thumb/jar-candle-label.jpg', w:1700, h:1300,
    category:'packaging', name:'Glass candle jar with blank kraft label',
    surfaces:[
      { id:'label', quad:[[437,800],[675,800],[675,1080],[437,1080]], aspect:1.02, curve:0.645, blend:'multiply', role:'label' }
    ],
    credit:{ author:'Christian Mackie', source:'ISO Republic', license:'CC0 1.0', url:'https://isorepublic.com/photo/candle-decoration-glass/' },
    notes:'Small label on a curved jar.' },
  { id:'mug-plain-wood', file:'assets/mockups/mug-plain-wood.jpg', thumb:'assets/mockups/thumb/mug-plain-wood.jpg', w:2400, h:1600,
    category:'packaging', name:'Plain white mug on a wooden table',
    surfaces:[
      { id:'wrap', quad:[[965,790],[1441,790],[1441,1260],[965,1260]], aspect:1.21, curve:0.645, blend:'multiply', role:'wrap' }
    ],
    credit:{ author:'Annie Spratt', source:'ISO Republic', license:'CC0 1.0', url:'https://isorepublic.com/photo/coffee-mug/' },
    notes:'Curved: curve 0.65.' },
  { id:'tote-canvas-hand', file:'assets/mockups/tote-canvas-hand.jpg', thumb:'assets/mockups/thumb/tote-canvas-hand.jpg', w:1280, h:1920,
    category:'packaging', name:'Natural canvas tote held up on white',
    surfaces:[
      { id:'front', quad:[[360,980],[1010,965],[1000,1400],[390,1415]], aspect:1.4, curve:0.0, blend:'multiply', role:'tote' }
    ],
    credit:{ author:'Efkanakbiyik', source:'Wikimedia Commons', license:'CC0 1.0', url:'https://commons.wikimedia.org/wiki/File:Baghashtag-Kanvas-Bez-Canta.jpg' },
    notes:'Original brand labels retouched out.' },
  { id:'tee-white-flat', file:'assets/mockups/tee-white-flat.jpg', thumb:'assets/mockups/thumb/tee-white-flat.jpg', w:2048, h:1536,
    category:'apparel', name:'Plain white T-shirt laid flat',
    surfaces:[
      { id:'chest', quad:[[690,330],[1290,330],[1290,1080],[690,1080]], aspect:0.8, curve:0.0, blend:'multiply', role:'tee' }
    ],
    credit:{ author:'Elkagye', source:'Wikimedia Commons', license:'Public domain', url:'https://commons.wikimedia.org/wiki/File:T-shirt2.jpg' },
    notes:'Snapshot rather than studio quality; chest print area.' },
  { id:'desk-monitor-flatlay', file:'assets/mockups/desk-monitor-flatlay.jpg', thumb:'assets/mockups/thumb/desk-monitor-flatlay.jpg', w:1920, h:1200,
    category:'digital', name:'Tablet, monitor and accessories flat lay on slate',
    surfaces:[
      { id:'tablet', quad:[[149,461],[496,457],[547,800],[229,802]], aspect:1.333, curve:0.0, blend:'normal', role:'screen-tablet' }
    ],
    credit:{ author:'Vadim Sherbakov', source:'Unsplash via Picsum', license:'Unsplash License', url:'https://unsplash.com/photos/Hi9GSwWkCJk' },
    notes:'Only the tablet screen is fully in frame.' },
  { id:'laptop-cafe-table', file:'assets/mockups/laptop-cafe-table.jpg', thumb:'assets/mockups/thumb/laptop-cafe-table.jpg', w:1920, h:1195,
    category:'digital', name:'Laptop and coffee cup on a café counter',
    surfaces:[
      { id:'screen', quad:[[628,300],[1374,302],[1376,785],[630,786]], aspect:1.6, curve:0.0, blend:'normal', role:'screen-laptop' }
    ],
    credit:{ author:'Alex Knight', source:'Wikimedia Commons', license:'CC0 1.0', url:'https://commons.wikimedia.org/wiki/File:White_cup_and_MacBook_(Unsplash).jpg' } },
  { id:'laptop-desk-dusk', file:'assets/mockups/laptop-desk-dusk.jpg', thumb:'assets/mockups/thumb/laptop-desk-dusk.jpg', w:2400, h:2162,
    category:'digital', name:'Laptop on a wooden table at dusk',
    surfaces:[
      { id:'screen', quad:[[742,521],[1607,367],[1774,1170],[924,1398]], aspect:1.6, curve:0, blend:'normal', role:'screen-laptop' }
    ],
    credit:{ author:'Alejandro Escamilla', source:'Unsplash via Picsum', license:'Unsplash License', url:'https://unsplash.com/photos/yC-Yzbqy7PY' },
    notes:'Bezel model name retouched out.' },
  { id:'laptop-desk-nook', file:'assets/mockups/laptop-desk-nook.jpg', thumb:'assets/mockups/thumb/laptop-desk-nook.jpg', w:1920, h:1280,
    category:'digital', name:'Laptop on a wooden writing desk in a nook',
    surfaces:[
      { id:'screen', quad:[[1174,138],[1777,181],[1700,703],[1101,600]], aspect:1.6, curve:0.0, blend:'normal', role:'screen-laptop' }
    ],
    credit:{ author:'Kari Shea', source:'Wikimedia Commons', license:'CC0 1.0', url:'https://commons.wikimedia.org/wiki/File:Laptop_and_books_(Unsplash).jpg' } },
  { id:'laptop-flatlay-wood', file:'assets/mockups/laptop-flatlay-wood.jpg', thumb:'assets/mockups/thumb/laptop-flatlay-wood.jpg', w:2400, h:1600,
    category:'digital', name:'Laptop from above on a wood desk',
    surfaces:[
      { id:'screen', quad:[[741,235],[1643,235],[1612,740],[779,737]], aspect:1.6, curve:0, blend:'normal', role:'screen-laptop' }
    ],
    credit:{ author:'Alejandro Escamilla', source:'Unsplash via Picsum', license:'Unsplash License', url:'https://unsplash.com/photos/xII7efH1G6o' },
    notes:'Bezel model name retouched out.' },
  { id:'laptop-office-mono', file:'assets/mockups/laptop-office-mono.jpg', thumb:'assets/mockups/thumb/laptop-office-mono.jpg', w:2400, h:1646,
    category:'digital', name:'Laptop in a bright office, front view',
    surfaces:[
      { id:'screen', quad:[[1220,657],[2060,651],[2085,1206],[1222,1208]], aspect:1.6, curve:0.0, blend:'normal', role:'screen-laptop' }
    ],
    credit:{ author:'NegativeSpace', source:'ISO Republic', license:'CC0 1.0', url:'https://isorepublic.com/photo/black-white-laptop-office/' } },
  { id:'laptop-warm-desk', file:'assets/mockups/laptop-warm-desk.jpg', thumb:'assets/mockups/thumb/laptop-warm-desk.jpg', w:2400, h:1600,
    category:'digital', name:'Laptop with shallow focus on a warm desk',
    surfaces:[
      { id:'screen', quad:[[1103,340],[1880,340],[1641,969],[866,852]], aspect:1.6, curve:0, blend:'normal', role:'screen-laptop' }
    ],
    credit:{ author:'Alejandro Escamilla', source:'Unsplash via Picsum', license:'Unsplash License', url:'https://unsplash.com/photos/tAKXap853rY' },
    notes:'Bezel model name retouched out.' },
  { id:'monitor-desk-white', file:'assets/mockups/monitor-desk-white.jpg', thumb:'assets/mockups/thumb/monitor-desk-white.jpg', w:1920, h:1440,
    category:'digital', name:'Desktop monitor and laptop on a white desk',
    surfaces:[
      { id:'monitor', quad:[[443,471],[1127,475],[1163,918],[487,1012]], aspect:1.778, curve:0.0, blend:'normal', role:'screen-laptop' },
      { id:'laptop', quad:[[1257,790],[1638,791],[1646,1049],[1260,1050]], aspect:1.6, curve:0.0, blend:'normal', role:'screen-laptop' }
    ],
    credit:{ author:'Patryk Sobczak', source:'Wikimedia Commons', license:'CC0 1.0', url:'https://commons.wikimedia.org/wiki/File:An_office_table_and_computers_(Unsplash).jpg' },
    notes:'Two screens; logo on the monitor chin retouched out.' },
  { id:'monitor-stand-studio', file:'assets/mockups/monitor-stand-studio.jpg', thumb:'assets/mockups/thumb/monitor-stand-studio.jpg', w:1280, h:1598,
    category:'digital', name:'Desktop monitor on a walnut stand in a white studio',
    surfaces:[
      { id:'screen', quad:[[258,179],[1092,140],[1092,802],[263,728]], aspect:1.778, curve:0.0, blend:'normal', role:'screen-laptop' }
    ],
    credit:{ author:'Gabriel Beaudry', source:'Wikimedia Commons', license:'CC0 1.0', url:'https://commons.wikimedia.org/wiki/File:Gabriel_Beaudry%27s_desk_setup_(Unsplash).jpg' },
    notes:'Logo on the monitor chin retouched out.' },
  { id:'phone-flat-walnut', file:'assets/mockups/phone-flat-walnut.jpg', thumb:'assets/mockups/thumb/phone-flat-walnut.jpg', w:2400, h:1800,
    category:'digital', name:'Black phone flat on a walnut desk',
    surfaces:[
      { id:'screen', quad:[[1062,624],[1340,624],[1334,1230],[1082,1230]], aspect:0.462, curve:0.0, blend:'normal', role:'screen-phone' }
    ],
    credit:{ author:'Tyler Lastovich', source:'Negative Space', license:'CC0 1.0', url:'https://negativespace.co/iphone-wood-desktop/' } },
  { id:'phone-hand-blank', file:'assets/mockups/phone-hand-blank.jpg', thumb:'assets/mockups/thumb/phone-hand-blank.jpg', w:1600, h:2400,
    category:'digital', name:'Phone in hand against a pale background',
    surfaces:[
      { id:'screen', quad:[[552,400],[1042,398],[1037,1524],[556,1504]], aspect:0.462, curve:0.0, blend:'normal', role:'screen-phone' }
    ],
    credit:{ author:'Design by Matt', source:'Negative Space', license:'CC0 1.0', url:'https://negativespace.co/phone-hand-smartphone/' } },
  { id:'phone-hand-grey', file:'assets/mockups/phone-hand-grey.jpg', thumb:'assets/mockups/thumb/phone-hand-grey.jpg', w:1920, h:1280,
    category:'digital', name:'Phone in hand against a grey wall',
    surfaces:[
      { id:'screen', quad:[[801,302],[1093,300],[1094,827],[802,829]], aspect:0.562, curve:0.0, blend:'normal', role:'screen-phone' }
    ],
    credit:{ author:'NeONBRAND', source:'Wikimedia Commons', license:'CC0 1.0', url:'https://commons.wikimedia.org/wiki/File:Spotify_on_smartphone_(Unsplash).jpg' },
    notes:'Screen content (a music app) is fully covered by the quad.' },
  { id:'phone-hand-sea', file:'assets/mockups/phone-hand-sea.jpg', thumb:'assets/mockups/thumb/phone-hand-sea.jpg', w:2400, h:1600,
    category:'digital', name:'Phone held up against a sea horizon',
    surfaces:[
      { id:'screen', quad:[[1052,558],[1331,556],[1333,1070],[1053,1072]], aspect:0.5625, curve:0, blend:'normal', role:'screen-phone' }
    ],
    credit:{ author:'Jordan McQueen', source:'Unsplash via Picsum', license:'Unsplash License', url:'https://unsplash.com/photos/1eWaod96d3k' } },
  { id:'phone-wood-table', file:'assets/mockups/phone-wood-table.jpg', thumb:'assets/mockups/thumb/phone-wood-table.jpg', w:2400, h:1600,
    category:'digital', name:'White music player on a pine table',
    surfaces:[
      { id:'screen', quad:[[668,539],[1155,199],[1783,1030],[1292,1386]], aspect:0.562, curve:0.0, blend:'normal', role:'screen-phone' }
    ],
    credit:{ author:'50Fish', source:'ISO Republic', license:'CC0 1.0', url:'https://isorepublic.com/photo/iphone-wood-background/' },
    notes:'Phone-proportioned screen in strong perspective.' },
  { id:'tablet-desk-keyboard', file:'assets/mockups/tablet-desk-keyboard.jpg', thumb:'assets/mockups/thumb/tablet-desk-keyboard.jpg', w:2400, h:1594,
    category:'digital', name:'Tablet beside a keyboard on a dark desk',
    surfaces:[
      { id:'screen', quad:[[263,1017],[821,825],[1378,1222],[799,1470]], aspect:0.75, curve:0, blend:'normal', role:'screen-tablet' }
    ],
    credit:{ author:'William Iven', source:'Unsplash via Picsum', license:'Unsplash License', url:'https://unsplash.com/photos/GANqCr1BRTU' } },
  { id:'tablet-phone-marble', file:'assets/mockups/tablet-phone-marble.jpg', thumb:'assets/mockups/thumb/tablet-phone-marble.jpg', w:1920, h:1280,
    category:'digital', name:'Tablet and phone on white marble',
    surfaces:[
      { id:'tablet', quad:[[327,725],[1050,388],[1312,920],[577,1272]], aspect:1.333, curve:0.0, blend:'normal', role:'screen-tablet' },
      { id:'phone', quad:[[1229,358],[1474,236],[1699,672],[1452,797]], aspect:0.562, curve:0.0, blend:'normal', role:'screen-phone' }
    ],
    credit:{ author:'Lauren Mancke', source:'Wikimedia Commons', license:'CC0 1.0', url:'https://commons.wikimedia.org/wiki/File:Lauren_Mancke_2016-05-27_(Unsplash).jpg' },
    notes:'Two screens.' }
];
