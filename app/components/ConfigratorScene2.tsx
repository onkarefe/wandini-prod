import React, { useEffect, useMemo, useState } from 'react';

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
  confirmButton?: React.ReactNode;
  inline?: boolean;
  showCloseButton?: boolean;
  imageUrl: string;
  widthCm: number;
  heightCm: number;
  crop: CropRect | null;
  selectedQualitySummary?: SelectedQualitySummary;
};

type SliceItem = {
  index: number;
  widthCm: number;
  dataUrl: string;
};

const MAX_PANEL_CM = 70;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function buildEqualCmSlices(totalWidthCm: number, maxSliceCm = MAX_PANEL_CM): number[] {
  const safeWidth = Math.max(0, totalWidthCm);
  if (safeWidth <= 0) return [];

  const panelCount = Math.max(1, Math.ceil(safeWidth / maxSliceCm));
  const panelWidth = safeWidth / panelCount;

  return Array.from({ length: panelCount }, () => panelWidth);
}

function formatCm(value: number): string {
  return value.toFixed(1).replace(/\.0$/, '');
}

async function createCroppedSlices(
  imageUrl: string,
  crop: CropRect,
  totalWidthCm: number,
): Promise<SliceItem[]> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const naturalW = img.naturalWidth || 0;
        const naturalH = img.naturalHeight || 0;
        if (!naturalW || !naturalH || totalWidthCm <= 0) {
          resolve([]);
          return;
        }

        const isRatioCrop =
          crop.x >= 0 &&
          crop.y >= 0 &&
          crop.w > 0 &&
          crop.h > 0 &&
          crop.x <= 1 &&
          crop.y <= 1 &&
          crop.w <= 1 &&
          crop.h <= 1;

        const pxCrop = isRatioCrop
          ? {
              x: Math.round(crop.x * naturalW),
              y: Math.round(crop.y * naturalH),
              w: Math.round(crop.w * naturalW),
              h: Math.round(crop.h * naturalH),
            }
          : {
              x: Math.round(crop.x),
              y: Math.round(crop.y),
              w: Math.round(crop.w),
              h: Math.round(crop.h),
            };

        const safeW = Math.max(1, pxCrop.w || 0);
        const safeH = Math.max(1, pxCrop.h || 0);
        const safeX = Math.max(0, Math.min(pxCrop.x || 0, Math.max(0, naturalW - safeW)));
        const safeY = Math.max(0, Math.min(pxCrop.y || 0, Math.max(0, naturalH - safeH)));

        const cmSlices = buildEqualCmSlices(totalWidthCm, MAX_PANEL_CM);
        if (!cmSlices.length) {
          resolve([]);
          return;
        }

        const pxSlices: number[] = [];
        let remainingPx = safeW;
        for (let i = 0; i < cmSlices.length; i++) {
          const last = i === cmSlices.length - 1;
          if (last) {
            pxSlices.push(Math.max(1, remainingPx));
            break;
          }

          const remainingPieces = cmSlices.length - i;
          const minReservedForRest = remainingPieces - 1;
          const maxThis = Math.max(1, remainingPx - minReservedForRest);
          const estimated = Math.round((safeW * cmSlices[i]) / totalWidthCm);
          const currentPx = clamp(estimated, 1, maxThis);
          pxSlices.push(currentPx);
          remainingPx -= currentPx;
        }

        const items: SliceItem[] = [];
        let offsetX = safeX;

        for (let i = 0; i < cmSlices.length; i++) {
          const panelW = Math.max(1, pxSlices[i] || 1);
          const canvas = document.createElement('canvas');
          canvas.width = panelW;
          canvas.height = safeH;
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;

          ctx.drawImage(
            img,
            offsetX,
            safeY,
            panelW,
            safeH,
            0,
            0,
            panelW,
            safeH,
          );

          let dataUrl = '';
          try {
            dataUrl = canvas.toDataURL('image/jpeg', 0.92);
          } catch {
            dataUrl = '';
          }
          if (!dataUrl) continue;

          items.push({
            index: i + 1,
            widthCm: cmSlices[i],
            dataUrl,
          });

          offsetX += panelW;
        }

        resolve(items);
      } catch {
        resolve([]);
      }
    };

    img.onerror = () => resolve([]);
    img.src = imageUrl;
  });
}

export function ConfigratorScene2({
  isOpen,
  onClose,
  confirmButton,
  inline = false,
  showCloseButton = true,
  imageUrl,
  widthCm,
  heightCm,
  crop,
  selectedQualitySummary,
}: ConfigratorScene2Props) {
  const shouldRender = isOpen || inline;

  const [slices, setSlices] = useState<SliceItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const widthsPreview = useMemo(
    () => buildEqualCmSlices(Math.max(0, widthCm), MAX_PANEL_CM),
    [widthCm],
  );

  useEffect(() => {
    let cancelled = false;

    if (!shouldRender) {
      setIsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    if (!crop || widthCm <= 0) {
      setSlices([]);
      setIsLoading(false);
      setError('No valid crop or width found.');
      return;
    }

    setIsLoading(true);
    setError(null);

    createCroppedSlices(imageUrl, crop, widthCm)
      .then((items) => {
        if (cancelled) return;
        setSlices(items);
        if (!items.length) {
          setError('No preview image could be generated during slicing.');
        }
      })
      .catch(() => {
        if (cancelled) return;
        setSlices([]);
        setError('An error occurred during slicing.');
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [crop, imageUrl, shouldRender, widthCm]);

  if (!shouldRender) return null;

  return (
    <div
      className={`configuratorSceneDialog cs2-dialog${inline ? ' configuratorSceneDialog--inline' : ''}`}
    >
      {showCloseButton && (
        <button
          type="button"
          className="configuratorSceneCloseButton"
          onClick={onClose}
          aria-label="Close preview"
        >
          X
        </button>
      )}

      <div className="cs2-layout">
        <div className="cs2-main">
          {isLoading && <div className="cs2-feedback">Preparing panels...</div>}
          {!isLoading && error && <div className="cs2-feedback">{error}</div>}

          {!isLoading && !error && slices.length > 0 && (
            <div className="cs2-slices-grid">
              {slices.map((slice) => (
                <div key={slice.index} className="cs2-slice-item">
                  <img
                    src={slice.dataUrl}
                    alt={`Panel ${slice.index}`}
                    className="cs2-slice-image"
                  />
                  <div className="cs2-slice-label">
                    {slice.index} - {formatCm(slice.widthCm)} cm
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="cs2-sidebar" aria-label="Preview summary">
          <div className="cs2-sidebar-card">
            <div className="cs2-sidebar-title">Summary</div>

            <div className="cs2-sidebar-stats">
              <div className="cs2-sidebar-section cs2-sidebar-section--compact">
                <div className="cs2-sidebar-label">Dimensions</div>
                <div className="cs2-sidebar-value">
                  {widthCm} cm x {heightCm} cm
                </div>
              </div>

              <div className="cs2-sidebar-section cs2-sidebar-section--compact">
                <div className="cs2-sidebar-label">Panel Count</div>
                <div className="cs2-sidebar-value">
                  {error ? '-' : (slices.length || widthsPreview.length)}
                </div>
              </div>
            </div>

            <div className="cs2-sidebar-section">
              <div className="cs2-sidebar-label">Print Material / Quality</div>
              {selectedQualitySummary ? (
                <div className="cs2-quality">
                  <div className="cs2-sidebar-value">{selectedQualitySummary.title}</div>
                  {selectedQualitySummary.properties.length > 0 && (
                    <div className="cs2-quality-properties">
                      {selectedQualitySummary.properties.map((property) => (
                        <div
                          key={`${selectedQualitySummary.title}-${property}`}
                          className="cs2-quality-property"
                        >
                          {property}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="cs2-sidebar-value cs2-sidebar-value--muted">
                  Quality information not found.
                </div>
              )}
            </div>
          </div>

          <span className="cs2-warning" role="note">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
              className="cs2-warning__icon"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
              />
            </svg>
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vestibulum sed
            erat aliquam, luctus quam sed, consequat magna.
          </span>

          <div className="cs2-sidebar-action">
            {confirmButton ?? (
              <button type="button" className="configuratorPreviewButton">
                Add to cart
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

