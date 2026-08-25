import {useEffect, useMemo, useState, type CSSProperties} from 'react';
import {useTranslation} from '~/i18n/useTranslation';

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

type CroppedPreview = {
  dataUrl: string;
  width: number;
  height: number;
};

const MAX_PANEL_WIDTH_CM = 70;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function calculatePanelWidths(totalWidthCm: number): number[] {
  const safeWidth = Math.max(0, totalWidthCm);
  if (!safeWidth) return [];

  const panelCount = Math.max(1, Math.ceil(safeWidth / MAX_PANEL_WIDTH_CM));
  const panelWidth = safeWidth / panelCount;

  return Array.from({length: panelCount}, () => panelWidth);
}

function formatCm(value: number): string {
  return value.toFixed(1).replace(/\.0$/, '');
}

async function createCroppedPreview(
  imageUrl: string,
  crop: CropRect,
): Promise<CroppedPreview | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';

    image.onload = () => {
      try {
        const naturalWidth = image.naturalWidth || 0;
        const naturalHeight = image.naturalHeight || 0;
        if (!naturalWidth || !naturalHeight) {
          resolve(null);
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

        const cropWidth = clamp(pixelCrop.w || 0, 1, naturalWidth);
        const cropHeight = clamp(pixelCrop.h || 0, 1, naturalHeight);
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
        const canvas = document.createElement('canvas');
        canvas.width = cropWidth;
        canvas.height = cropHeight;

        const context = canvas.getContext('2d');
        if (!context) {
          resolve(null);
          return;
        }

        context.drawImage(
          image,
          cropX,
          cropY,
          cropWidth,
          cropHeight,
          0,
          0,
          cropWidth,
          cropHeight,
        );

        try {
          resolve({
            dataUrl: canvas.toDataURL('image/jpeg', 0.92),
            width: cropWidth,
            height: cropHeight,
          });
        } catch {
          // A cross-origin image can prevent canvas export.
          resolve(null);
        }
      } catch {
        resolve(null);
      }
    };

    image.onerror = () => resolve(null);
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
  const {t} = useTranslation();
  const shouldRender = isOpen || inline;
  const expectedPanelWidths = useMemo(
    () => calculatePanelWidths(widthCm),
    [widthCm],
  );
  const [preview, setPreview] = useState<CroppedPreview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<'dimensions' | 'preview' | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!shouldRender) {
      setIsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    if (!crop || widthCm <= 0 || heightCm <= 0) {
      setPreview(null);
      setIsLoading(false);
      setError('dimensions');
      return;
    }

    setIsLoading(true);
    setError(null);

    createCroppedPreview(imageUrl, crop)
      .then((nextPreview) => {
        if (cancelled) return;
        setPreview(nextPreview);
        setError(
          nextPreview
            ? null
            : 'preview',
        );
      })
      .catch(() => {
        if (cancelled) return;
        setPreview(null);
        setError('preview');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [crop, heightCm, imageUrl, shouldRender, widthCm]);

  if (!shouldRender) return null;

  const panelCount = expectedPanelWidths.length;
  const panelWidth = expectedPanelWidths[0] || 0;
  const totalPanelWidth = expectedPanelWidths.reduce(
    (sum, currentWidth) => sum + currentWidth,
    0,
  );

  return (
    <div className="wallOrderReview">
      {showCloseButton && (
        <button
          type="button"
          className="wallOrderReview__close"
          onClick={onClose}
          aria-label={t('configurator.previewClose')}
        >
          X
        </button>
      )}

      <section
        className="wallOrderReview__preview"
        aria-label={t('configurator.panelPreview')}
      >
        {isLoading && (
          <div className="wallOrderReview__status">
            {t('configurator.creatingPanels')}
          </div>
        )}

        {!isLoading && error && (
          <div className="wallOrderReview__status wallOrderReview__status--error">
            {t(
              error === 'dimensions'
                ? 'configurator.invalidDimensions'
                : 'configurator.previewFailed',
            )}
          </div>
        )}

        {!isLoading && !error && preview && panelCount > 0 && (
          <div className="wallOrderReview__scroller">
            <figure
              className="wallOrderReview__artwork"
              style={
                {
                  '--artwork-aspect-ratio': `${preview.width} / ${preview.height}`,
                } as CSSProperties
              }
            >
              <img
                src={preview.dataUrl}
                alt={t('configurator.wallpaperPreviewAlt')}
              />
              <div className="wallOrderReview__panelGuides" aria-hidden="true">
                {expectedPanelWidths.map((currentWidth, index) => {
                  const widthBefore = expectedPanelWidths
                    .slice(0, index)
                    .reduce((sum, itemWidth) => sum + itemWidth, 0);
                  const left = (widthBefore / totalPanelWidth) * 100;
                  const segmentWidth = (currentWidth / totalPanelWidth) * 100;

                  return (
                    <div
                      key={index}
                      className="wallOrderReview__panelGuide"
                      style={{
                        left: `${left}%`,
                        width: `${segmentWidth}%`,
                      }}
                    >
                      <span>
                        {t('configurator.panel', {number: index + 1})}
                        <strong>{formatCm(currentWidth)} cm</strong>
                      </span>
                    </div>
                  );
                })}
              </div>
            </figure>
          </div>
        )}
      </section>

      <section
        className="wallOrderReview__summary"
        aria-label={t('configurator.orderSummary')}
      >
        <div className="wallOrderReview__summaryHeader">
          <span>{t('configurator.orderSummary')}</span>
          <h3>{t('configurator.yourWallpaper')}</h3>
        </div>

        <div className="wallOrderReview__details">
          <div>
            <span>{t('configurator.wallDimensions')}</span>
            <strong>
              {formatCm(widthCm)} × {formatCm(heightCm)} cm
            </strong>
          </div>
          <div>
            <span>{t('configurator.layout')}</span>
            <strong>{t('configurator.panels', {count: panelCount})}</strong>
            {panelWidth > 0 && (
              <small>
                {t('configurator.panelWidth', {width: formatCm(panelWidth)})}
              </small>
            )}
          </div>
          <div>
            <span>{t('configurator.material')}</span>
            <strong>{selectedQualitySummary?.title || '–'}</strong>
          </div>
        </div>

        {totalPrice && (
          <div className="wallOrderReview__total">
            <span>{t('configurator.totalPrice')}</span>
            <strong>{totalPrice}</strong>
          </div>
        )}

        <div className="wallOrderReview__notice" role="note">
          <div>
            <strong>{t('configurator.installationNoticeTitle')}</strong>
            <p>{t('configurator.installationNotice')}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
