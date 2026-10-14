# Asset sources and licences

Everything in the v2 home that was not modelled from scratch in `build_home.py` / `dressing.py`, and where it came from. Nothing here shows a brand, a logo, a real person or a known artwork.

## Clay-statue figures (`assets/people/*.blend`)

Built by `family.py` (round 3).

### Dad, Mum, Grandpa and Milo: real 3D scans (Sketchfab, CC BY 4.0)

Downloaded from Sketchfab, then turned into one closed matte clay surface, rigged and posed by `scans.py` and `scan_pose.py`. The colour photo texture is not used. The raw downloads and working files stay local in `assets/scans/` (gitignored).

| Figure | Sketchfab model | Author | Licence |
|---|---|---|---|
| Dad | [Character Scan Photogrammetry](https://sketchfab.com/3d-models/e62179794eae4e74b06a8f8f5153c0cc) | danteg | **CC BY 4.0** |
| Mum | [S "A" pose - Lenscloud Scanner Hi-Poly](https://sketchfab.com/3d-models/3d1ba75f9b714e55b3a1e82755c02ed4) | Lenscloud3D | **CC BY 4.0** |
| Grandpa | [Shannon Norrell-A- Pose](https://sketchfab.com/3d-models/bbd77e5070624713b5f8b2c2a081506f) | webdood | **CC BY 4.0** |
| Milo (cat) | [Cat Stretching](https://sketchfab.com/3d-models/3524218d6a804e29901c4324ee47aa10) | kingofrichland | **CC BY 4.0** |

### Arlo, Zoe, Leo and Mira: MakeHuman (the round-2 children)

Built by `make_people.py` with **MPFB 2.0.18** (MakeHuman for Blender, GPL-3.0 add-on; the characters it generates are **CC0**, see https://static.makehumancommunity.org/about/license.html). Each figure's body, face and expression come from MakeHuman's CC0 base mesh, targets and face units. The poses, the clay finish and the sculpted folds are made in the script.

Clothes and hair fitted to the children, from the MakeHuman community asset packs (https://static.makehumancommunity.org/assets/assetpacks/index.html):

| Asset | Used on | Author | Licence |
|---|---|---|---|
| toigo_harem_pants | Zoe, Mira | MargaretToigo (MRT) | CC0 |
| littleright_bobcut_hair | Mira | littleright | CC0 (hair01 pack) |
| cortu_strawberry_cloud_hair | Zoe | Cortu | CC0 (hair01 pack) |
| joepal_crude_t-shirt_female | Leo | Joel Palmius | CC0 |
| elvs_crude_t-shirt_male | Arlo | Elvaerwyn | CC0 (shirts01 pack) |
| cortu_cargo_pants | Arlo, Leo | Cortu | CC0 (pants01 pack) |
| shoes, eyes high-poly, hair short01 | several | MakeHuman team | CC0 (system assets) |
| mindfront_knitted_sweater_01 | Zoe | Mindfront | **CC BY 4.0** |
| elvs_male_shirt_untucked_bd1 | Mira | Elvaerwyn | **CC BY** |
| elvs_maxwell_hair | Arlo | Elvaerwyn | **CC BY** |

**Attribution (needed for the CC BY items):** the site's credits or legal page needs a line such as: *"3D people: scans by danteg, Lenscloud3D and webdood, cat by kingofrichland (Sketchfab, CC BY 4.0); clothing and hair by Mindfront and Elvaerwyn via the MakeHuman community (CC BY 4.0)."*

## Poly Haven (CC0, https://polyhaven.com/license)

Downloaded by `fetch_assets.py` into `assets/polyhaven/` and packed into `home.blend`.

- **Models:** potted_plant_01, potted_plant_02, potted_plant_04, calathea_orbifolia_01, anthurium_botany_01, fern_02, pachira_aquatica_01, food_apple_01, bananas, lemon, food_pears_asian_01, wooden_cutting_board, jug_01, vintage_electric_kettle, tea_set_01, round_spectacles, standing_picture_frame_01, standing_picture_frame_02, wicker_basket_01, wicker_basket_02, wooden_bowl_01, ceramic_vase_01, ceramic_vase_02, ceramic_vase_03, carved_wooden_elephant, rubber_duck_toy, watering_can_metal_01, croissant, throw_pillows_01, shrub_01, shrub_02, shrub_04, tree_small_02.
- **Textures:** wood_floor, painted_plaster_wall, walnut_veneer, white_oak_veneer, marble_01, long_white_tiles, rough_linen, knitted_fleece, poly_wool_herringbone, ribbed_corduroy, velour_velvet, curly_teddy_natural, hessian_230, gingham_check, wool_boucle, leafy_grass, weathered_planks, white_bricks.

The pictures inside the two standing photo frames are replaced with the home's own artwork.

## Artwork (`assets/art/`)

All drawn procedurally by `make_art.py` for this project (paintings, children's drawings, calendar, birthday garland, picture-book spread, cookbook and letter pages, book spines). Original, no third-party content. Font for the garland letters and calendar: DejaVu Sans Bold (free licence, bundled with most Linux systems; any bold sans works).

## Everything else

The room, furniture, the Alaro camera model and all procedural materials are original procedural builds (v1, `build_home.py` and `alaro-camera/build_alaro_camera.py`).
