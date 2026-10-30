# Pool Replastering Page — Image Notes

Page: `/pool-replastering/` (`pool-replastering/index.html`)

The page uses three authentic photographs supplied by Hogan Pools. No AI-generated
images are on the page. The temporary AI illustrations used earlier were removed; their
originals are in `hogan-pools-replastering-web-images.zip` if they are ever needed.

Files live in `assets/img-webp/replastering/`. Original JPEGs are archived privately by
the site owner and are not in this repo.

## Images on the page

| Section  | Files                                                                           | Ratio | Source file                        | Caption                                                 |
| -------- | ------------------------------------------------------------------------------- | ----- | ---------------------------------- | ------------------------------------------------------- |
| Hero     | `hero-finished-white-plaster-768.webp`, `hero-finished-white-plaster-1440.webp` | 16:10 | `20190512_150245.jpg`              | A newly plastered residential pool interior.            |
| Finishes | `aggregate-surface-detail-640.webp`, `aggregate-surface-detail-1280.webp`       | 16:9  | `IMG_6351.jpg`                     | Close-up of a pebble pool finish.                       |
| Process  | `plaster-trowel-card-480.webp`, `plaster-trowel-card-720.webp`                  | 4:5   | `VideoCapture_20250227-184106.jpg` | A Hogan Pools crew applying an interior finish by hand. |

The hero 1440 file is also the `og:image` / `twitter:image`.

## Accuracy rules for these photos

- Captions and alt text describe only what is visible. None of the photos is confirmed
  as a replastering job (as opposed to new-construction plastering), so do not call them
  replaster projects.
- The hero shows a dry, newly plastered pool. Do not describe it as filled or finished.
- The owner confirmed the close-up (`IMG_6351.jpg`) is a pebble finish and the trowel
  photo shows the Hogan Pools crew. The pebble photo sits above the finish cards so the
  three cards stay balanced. The product/brand is not named.
- The finish cards are text-only. Do not label the white pool as marcite or the
  aggregate as quartz without real, identified samples.
- The April 2019 and May 2019 photos show different pools. Never pair them as
  before/after.

## Supplied photos not used

- `crew-white-plaster*.webp` (April 2019): a worker's shirt shows another company's
  name ("AQUA-POOL…") and phone number, and the people are recognizable. Not copied
  into the repo.
- `finished-pool-interior-*.webp`: same pool as the hero; redundant.
- `plaster-trowel-application-*.webp`: uncropped version of the process photo.

## Replacing an image

Swap the file (keep the name, or update `src`/`srcset`), update `width`/`height`, and
keep the caption and alt text factual. Figure styles (`.service-figure`, `--wide`,
`--medium`, `--portrait`) in `css/site.css` are not tied to filenames.
