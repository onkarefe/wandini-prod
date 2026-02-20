import React, { useEffect, useMemo, useState } from 'react';

type CropRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

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
};

type SliceItem = {
  index: number;
  widthCm: number;
  dataUrl: string;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function buildCmSlices(totalWidthCm: number, maxSliceCm = 120): number[] {
  const widths: number[] = [];
  let remaining = Math.max(0, totalWidthCm);

  while (remaining > 0) {
    const current = Math.min(maxSliceCm, remaining);
    widths.push(Number(current.toFixed(2)));
    remaining = Number((remaining - current).toFixed(2));
  }

  return widths;
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

      const cmSlices = buildCmSlices(totalWidthCm, 120);
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
          dataUrl = canvas.toDataURL();
        }

        items.push({
          index: i + 1,
          widthCm: cmSlices[i],
          dataUrl,
        });

        offsetX += panelW;
      }

      resolve(items);
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
  crop,
}: ConfigratorScene2Props) {
  if (!isOpen && !inline) return null;

  const [slices, setSlices] = useState<SliceItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const widthsPreview = useMemo(
    () => buildCmSlices(Math.max(0, widthCm), 120),
    [widthCm],
  );

  useEffect(() => {
    let cancelled = false;

    if (!crop || widthCm <= 0) {
      setSlices([]);
      setError('Gecerli crop veya genislik yok.');
      return;
    }

    setIsLoading(true);
    setError(null);

    createCroppedSlices(imageUrl, crop, widthCm)
      .then((items) => {
        if (cancelled) return;
        setSlices(items);
        if (!items.length) {
          setError('Parcalama sirasinda gorsel uretilemedi.');
        }
      })
      .catch(() => {
        if (cancelled) return;
        setSlices([]);
        setError('Parcalama sirasinda hata olustu.');
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [crop, imageUrl, widthCm]);

  return (
    <div
      className={`configuratorSceneDialog${inline ? ' configuratorSceneDialog--inline' : ''}`}
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

      <div style={{ marginBottom: '12px' }}>
        <strong>Panel dagilimi:</strong> {widthsPreview.join(' - ')} cm
      </div>

      {isLoading && <div>Parcalar hazirlaniyor...</div>}
      {!isLoading && error && <div>{error}</div>}

      {!isLoading && !error && slices.length > 0 && (
        <div style={{ display: 'grid', gap: '12px', marginBottom: '16px' }}>
          {slices.map((slice) => (
            <div key={slice.index}>
              <div style={{ marginBottom: '6px' }}>
                Parca {slice.index}: {slice.widthCm} cm
              </div>
              <img
                src={slice.dataUrl}
                alt={`Panel ${slice.index}`}
                style={{ maxWidth: '100%', height: 'auto', display: 'block' }}
              />
            </div>
          ))}
        </div>
      )}

      {confirmButton ?? (
        <button type="button" className="configuratorPreviewButton">
          Add to cart
        </button>
      )}
    </div>
  );
}
