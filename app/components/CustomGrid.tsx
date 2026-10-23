import type {CSSProperties} from 'react';
import {Link} from '~/lib/i18n-router';
import {useTranslation} from '~/i18n/useTranslation';
import {shopifyImageWidth} from '~/lib/responsive-image';

export type CustomGridItem = {
  id: string;
  title: string;
  image: {
    url: string;
    altText?: string;
    width?: number;
    height?: number;
  } | null;
  link: string;
  buttonText: string;
};

interface CustomGridProps {
  items?: CustomGridItem[];
  sectionTitle?: string | null;
}

const TILE_CLASS_NAMES = [
  'cgBox1',
  'cgBox2',
  'cgBox3',
  'cgBox4',
  'cgBox5',
  'cgBox6',
] as const;

function getTileStyle(
  image: CustomGridItem['image'],
  index: number,
): CSSProperties | undefined {
  // At the largest container, tiles are 760px wide and up to 700px tall.
  // Account for cover scaling of landscape sources without changing the crop.
  const height = index === 0 || index === 5 ? 700 : 342;
  const width =
    image?.width && image.height
      ? Math.min(
          image.width,
          Math.ceil(Math.max(800, (height * image.width) / image.height) * 2),
        )
      : 1600;
  return image?.url
    ? {
        backgroundImage: `url("${shopifyImageWidth(image.url, width)}")`,
      }
    : undefined;
}

function CustomGridTile({
  item,
  index,
}: {
  item: CustomGridItem;
  index: number;
}) {
  const {t} = useTranslation();
  const tileClassName = TILE_CLASS_NAMES[index] ?? TILE_CLASS_NAMES[0];
  const className = `${tileClassName} cgBoxMain`;
  const style = getTileStyle(item.image, index);

  if (item.link) {
    return (
      <Link className={className} style={style} to={item.link}>
        <div className="cg-title">{item.title}</div>
        {item.buttonText ? (
          <span className="cg-button">{item.buttonText}</span>
        ) : null}
      </Link>
    );
  }

  return (
    <div className={className} style={style}>
      <div className="cg-title">{item.title}</div>
      {item.buttonText ? (
        <button
          type="button"
          className="cg-button"
          aria-label={t('common.comingSoonLabel', {label: item.buttonText})}
          aria-disabled="true"
          title={t('common.comingSoon')}
        >
          {item.buttonText}
        </button>
      ) : null}
    </div>
  );
}

export default function CustomGrid({
  items = [],
  sectionTitle,
}: CustomGridProps) {
  const tiles = items.slice(0, TILE_CLASS_NAMES.length);
  const firstStackTiles = [
    {item: tiles[1], index: 1},
    {item: tiles[2], index: 2},
  ].filter(
    (tile): tile is {item: CustomGridItem; index: number} => Boolean(tile.item),
  );
  const secondStackTiles = [
    {item: tiles[3], index: 3},
    {item: tiles[4], index: 4},
  ].filter(
    (tile): tile is {item: CustomGridItem; index: number} => Boolean(tile.item),
  );

  if (tiles.length === 0) {
    return null;
  }

  return (
    <section className="custom-6-grid container mx-auto">
      {sectionTitle?.trim() ? (
        <div className="seperator">
          <h2>{sectionTitle.trim()}</h2>
        </div>
      ) : null}

      {tiles[0] || firstStackTiles.length > 0 ? (
        <div className="cg-line1">
          {tiles[0] ? <CustomGridTile item={tiles[0]} index={0} /> : null}
          {firstStackTiles.length > 0 ? (
            <div className="cg1-part2">
              {firstStackTiles.map((tile) => (
                <CustomGridTile
                  key={tile.item.id}
                  item={tile.item}
                  index={tile.index}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {secondStackTiles.length > 0 || tiles[5] ? (
        <div className="cg-line2">
          {secondStackTiles.length > 0 ? (
            <div className="cg2-part2">
              {secondStackTiles.map((tile) => (
                <CustomGridTile
                  key={tile.item.id}
                  item={tile.item}
                  index={tile.index}
                />
              ))}
            </div>
          ) : null}
          {tiles[5] ? <CustomGridTile item={tiles[5]} index={5} /> : null}
        </div>
      ) : null}
    </section>
  );
}
