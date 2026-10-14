# Asset sources and licences

Everything in the v2 home that was not modelled from scratch in `build_home.py` / `dressing.py`, and where it came from. Nothing here shows a brand, a logo, a real person or a known artwork.

## Clay-statue figures (`assets/people/*.blend`)

Built by `make_people.py` with **MPFB 2.0.18** (MakeHuman for Blender, GPL-3.0 add-on; the characters it generates are **CC0**, see https://static.makehumancommunity.org/about/license.html). Each figure's body, face and expression come from MakeHuman's CC0 base mesh, targets and face units. Poses, the clay finish, the sculpted folds and Milo the cat are made in the script.

Clothes and hair fitted to the figures, from the MakeHuman community asset packs (https://static.makehumancommunity.org/assets/assetpacks/index.html):

| Asset | Used on | Author | Licence |
|---|---|---|---|
| toigo_fisherman_sweater | Dad | MargaretToigo (MRT) | CC0 |
| toigo_wool_pants | Dad, Mum, Grandpa | MargaretToigo (MRT) | CC0 |
| toigo_harem_pants | Zoe, Mira | MargaretToigo (MRT) | CC0 |
| littleright_bobcut_hair | Mira | littleright | CC0 (hair01 pack) |
| cortu_strawberry_cloud_hair | Zoe | Cortu | CC0 (hair01 pack) |
| joepal_crude_t-shirt_female | Leo | Joel Palmius | CC0 |
| elvs_crude_t-shirt_male | Arlo | Elvaerwyn | CC0 (shirts01 pack) |
| janexx_old_female_sweater | Mum | janexx | CC0 |
| cortu_cargo_pants | Arlo, Leo | Cortu | CC0 (pants01 pack) |
| shoes04, shoes05, eyes high-poly, hair short01/02/04 | several | MakeHuman team | CC0 (system assets) |
| mindfront_lusekofta | Grandpa | Mindfront | **CC BY 4.0** |
| mindfront_knitted_sweater_01 | Zoe | Mindfront | **CC BY 4.0** |
| elvs_male_shirt_untucked_bd1 | Grandpa, Mira | Elvaerwyn | **CC BY** |
| elvs_hazel_hair | Mum | Elvaerwyn | **CC BY** |
| elvs_maxwell_hair | Arlo | Elvaerwyn | **CC BY** |

**Attribution (needed for the CC BY items):** if the site has a credits or legal page, add a line such as: *"3D clothing and hair: Mindfront and Elvaerwyn via the MakeHuman community (CC BY 4.0)."* Swapping these for CC0 garments in `make_people.py` (`PEOPLE`) removes the requirement.

## Poly Haven (CC0, https://polyhaven.com/license)

Downloaded by `fetch_assets.py` into `assets/polyhaven/` and packed into `home.blend`.

- **Models:** potted_plant_01, potted_plant_02, potted_plant_04, calathea_orbifolia_01, anthurium_botany_01, fern_02, pachira_aquatica_01, food_apple_01, bananas, lemon, food_pears_asian_01, wooden_cutting_board, jug_01, vintage_electric_kettle, tea_set_01, round_spectacles, standing_picture_frame_01, standing_picture_frame_02, wicker_basket_01, wicker_basket_02, wooden_bowl_01, ceramic_vase_01, ceramic_vase_02, ceramic_vase_03, carved_wooden_elephant, rubber_duck_toy, watering_can_metal_01, croissant, throw_pillows_01, shrub_01, shrub_02, shrub_04, tree_small_02.
- **Textures:** wood_floor, painted_plaster_wall, walnut_veneer, white_oak_veneer, marble_01, long_white_tiles, rough_linen, knitted_fleece, poly_wool_herringbone, ribbed_corduroy, velour_velvet, curly_teddy_natural, hessian_230, gingham_check, wool_boucle, leafy_grass, weathered_planks, white_bricks.

The pictures inside the two standing photo frames are replaced with the home's own artwork.

## Artwork (`assets/art/`)

All drawn procedurally by `make_art.py` for this project (paintings, children's drawings, calendar, birthday garland, picture-book spread, cookbook and letter pages, book spines). Original, no third-party content. Font for the garland letters and calendar: DejaVu Sans Bold (free licence, bundled with most Linux systems; any bold sans works).

## Everything else

The room, furniture, the Alaro camera model and all procedural materials are original procedural builds (v1, `build_home.py` and `alaro-camera/build_alaro_camera.py`).
