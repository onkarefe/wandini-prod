import {useEffect, useMemo, useState, type CSSProperties} from 'react';

type CropRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type SelectedQualitySummary = {
  title: string;
  properties: string[];
} | null;

type ConfigratorScene2Props = {
  isOpen: boolean;
  onClose: () => void;
  inline?: boolean;
  showCloseButton?: boolean;
  imageUrl: string;
  widthCm: number;
  heightCm: number;
  crop: CropRect | null;
  selectedQualitySummary?: SelectedQualitySummary;
  totalPrice?: string;
};

type SliceItem = {
  index: number;
  widthCm: number;
  dataUrl: string;
};

const MAX_PANEL_WIDTH_CM = 70;
const PANEL_DISPLAY_SCALE = 1.18;
const MOBILE_PANEL_DISPLAY_SCALE = 1.34;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function calculatePanelWidths(totalWidthCm: number): number[] {
  const safeWidth = Math.max(0, totalWidthCm);
  if (!safeWidth) return [];

  const panelCount = Math.max(
    1,
    Math.ceil(safeWidth / MAX_PANEL_WIDTH_CM),
  );
  const panelWidth = safeWidth / panelCount;

  return Array.from({length: panelCount}, () => panelWidth);
}

function formatCm(value: number): string {
  return value.toFixed(1).replace(/\.0$/, '');
}

async function createPanelImages(
  imageUrl: string,
  crop: CropRect,
  totalWidthCm: number,
): Promise<SliceItem[]> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';

    image.onload = () => {
      try {
        const naturalWidth = image.naturalWidth || 0;
        const naturalHeight = image.naturalHeight || 0;
        if (!naturalWidth || !naturalHeight || totalWidthCm <= 0) {
          resolve([]);
          return;
        }

        const usesRelativeCrop =
          crop.x >= 0 &&
          crop.y >= 0 &&
          crop.w > 0 &&
          crop.h > 0 &&
          crop.x <= 1 &&
          crop.y <= 1 &&
          crop.w <= 1 &&
          crop.h <= 1;

        const pixelCrop = usesRelativeCrop
          ? {
              x: Math.round(crop.x * naturalWidth),
              y: Math.round(crop.y * naturalHeight),
              w: Math.round(crop.w * naturalWidth),
              h: Math.round(crop.h * naturalHeight),
            }
          : {
              x: Math.round(crop.x),
              y: Math.round(crop.y),
              w: Math.round(crop.w),
              h: Math.round(crop.h),
            };

        const cropWidth = Math.max(1, pixelCrop.w || 0);
        const cropHeight = Math.max(1, pixelCrop.h || 0);
        const cropX = clamp(
          pixelCrop.x || 0,
          0,
          Math.max(0, naturalWidth - cropWidth),
        );
        const cropY = clamp(
          pixelCrop.y || 0,
          0,
          Math.max(0, naturalHeight - cropHeight),
        );
        const panelWidths = calculatePanelWidths(totalWidthCm);

        if (!panelWidths.length) {
          resolve([]);
          return;
        }

        const panelPixelWidths: number[] = [];
        let remainingPixels = cropWidth;

        panelWidths.forEach((panelWidth, index) => {
          const isLastPanel = index === panelWidths.length - 1;
          if (isLastPanel) {
            panelPixelWidths.push(Math.max(1, remainingPixels));
            return;
          }

          const remainingPanels = panelWidths.length - index;
          const maximumCurrentWidth = Math.max(
            1,
            remainingPixels - (remainingPanels - 1),
          );
          const proportionalWidth = Math.round(
            (cropWidth * panelWidth) / totalWidthCm,
          );
          const currentWidth = clamp(
            proportionalWidth,
            1,
            maximumCurrentWidth,
          );

          panelPixelWidths.push(currentWidth);
          remainingPixels -= currentWidth;
        });

        const panels: SliceItem[] = [];
        let panelX = cropX;

        panelWidths.forEach((panelWidthCm, index) => {
          const panelWidthPx = Math.max(1, panelPixelWidths[index] || 1);
          const canvas = document.createElement('canvas');
          canvas.width = panelWidthPx;
          canvas.height = cropHeight;

          const context = canvas.getContext('2d');
          if (!context) return;

          context.drawImage(
            image,
            panelX,
            cropY,
            panelWidthPx,
            cropHeight,
            0,
            0,
            panelWidthPx,
            cropHeight,
          );

          try {
            panels.push({
              index: index + 1,
              widthCm: panelWidthCm,
              dataUrl: canvas.toDataURL('image/jpeg', 0.92),
            });
          } catch {
            // A cross-origin image can prevent canvas export.
          }

          panelX += panelWidthPx;
        });

        resolve(panels);
      } catch {
        resolve([]);
      }
    };

    image.onerror = () => resolve([]);
    image.src = imageUrl;
  });
}

export function ConfigratorScene2({
  isOpen,
  onClose,
  inline = false,
  showCloseButton = true,
  imageUrl,
  widthCm,
  heightCm,
  crop,
  selectedQualitySummary,
  totalPrice,
}: ConfigratorScene2Props) {
  const shouldRender = isOpen || inline;
  const expectedPanelWidths = useMemo(
    () => calculatePanelWidths(widthCm),
    [widthCm],
  );
  const [panels, setPanels] = useState<SliceItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!shouldRender) {
      setIsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    if (!crop || widthCm <= 0 || heightCm <= 0) {
      setPanels([]);
      setIsLoading(false);
      setError('Für diese Maße konnte keine Vorschau erstellt werden.');
      return;
    }

    setIsLoading(true);
    setError(null);

    createPanelImages(imageUrl, crop, widthCm)
      .then((nextPanels) => {
        if (cancelled) return;
        setPanels(nextPanels);
        setError(
          nextPanels.length
            ? null
            : 'Die Tapetenbahnen konnten nicht erstellt werden.',
        );
      })
      .catch(() => {
        if (cancelled) return;
        setPanels([]);
        setError('Die Tapetenbahnen konnten nicht erstellt werden.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [crop, heightCm, imageUrl, shouldRender, widthCm]);

  if (!shouldRender) return null;

  const panelCount = panels.length || expectedPanelWidths.length;
  const panelWidth = expectedPanelWidths[0] || 0;

  return (
    <div className="wallOrderReview">
      {showCloseButton && (
        <button
          type="button"
          className="wallOrderReview__close"
          onClick={onClose}
          aria-label="Vorschau schließen"
        >
          X
        </button>
      )}

      <section
        className="wallOrderReview__preview"
        aria-label="Vorschau der Tapetenbahnen"
      >
        {isLoading && (
          <div className="wallOrderReview__status">
            Tapetenbahnen werden erstellt …
          </div>
        )}

        {!isLoading && error && (
          <div className="wallOrderReview__status wallOrderReview__status--error">
            {error}
          </div>
        )}

        {!isLoading && !error && panels.length > 0 && (
          <div className="wallOrderReview__scroller">
            <div className="wallOrderReview__panels">
              {panels.map((panel) => (
                <figure
                  key={panel.index}
                  className="wallOrderReview__panel"
                  style={{
                    '--panel-aspect-ratio': `${
                      panel.widthCm * PANEL_DISPLAY_SCALE
                    } / ${Math.max(heightCm, 1)}`,
                    '--panel-mobile-aspect-ratio': `${
                      panel.widthCm * MOBILE_PANEL_DISPLAY_SCALE
                    } / ${Math.max(heightCm, 1)}`,
                  } as CSSProperties}
                >
                  <img src={panel.dataUrl} alt={`Bahn ${panel.index}`} />
                  <figcaption>
                    <span>Bahn {panel.index}</span>
                    <strong>{formatCm(panel.widthCm)} cm</strong>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        )}
      </section>

      <section
        className="wallOrderReview__summary"
        aria-label="Bestellübersicht"
      >
        <div className="wallOrderReview__summaryHeader">
          <span>Bestellübersicht</span>
          <h3>Deine Fototapete</h3>
        </div>

        <div className="wallOrderReview__details">
          <div>
            <span>Wandmaß</span>
            <strong>
              {formatCm(widthCm)} × {formatCm(heightCm)} cm
            </strong>
          </div>
          <div>
            <span>Aufteilung</span>
            <strong>{panelCount} Bahnen</strong>
            {panelWidth > 0 && (
              <small>je ca. {formatCm(panelWidth)} cm breit</small>
            )}
          </div>
          <div>
            <span>Material</span>
            <strong>{selectedQualitySummary?.title || '–'}</strong>
          </div>
        </div>

        {totalPrice && (
          <div className="wallOrderReview__total">
            <span>Gesamtpreis</span>
            <strong>{totalPrice}</strong>
          </div>
        )}

        <div className="wallOrderReview__notice" role="note">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8.25v4.5M12 16h.01" />
          </svg>
          <div>
            <strong>Montagehinweis</strong>
            <p>
              Plane umlaufend 6 cm Beschnittzugabe für eine passgenaue Montage
              ein.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
