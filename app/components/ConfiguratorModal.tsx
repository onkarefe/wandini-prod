import React, { useState } from 'react';
import { Configurator } from './Configurator';
// import { ConfigratorScene } from './ConfigratorScene';
import { ConfigratorScene2 } from './ConfigratorScene2';

type CropRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type ConfiguratorModalProps = {
  isOpen: boolean;
  onClose: () => void;
  qualityOptions?: React.ReactNode;
  confirmButton?: React.ReactNode;

  imageUrl: string;
  widthCm: number;
  heightCm: number;

  crop: CropRect | null;
  onCropChange: (crop: CropRect | null) => void;
};

export function ConfiguratorModal({
  isOpen,
  onClose,
  imageUrl,
  widthCm,
  heightCm,
  crop,
  onCropChange,
  qualityOptions,
  confirmButton,
}: ConfiguratorModalProps) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  if (!isOpen) return null;

  const handleClose = () => {
    setIsPreviewOpen(false);
    onClose();
  };

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  return (
    <div
      className="configuratorModalOverlay"
      onClick={handleOverlayClick}
    >
      <div
        className={`configuratorModal${isPreviewOpen ? ' configuratorModal--preview' : ''}`}
      >
        <button
          type="button"
          className="configuratorModalIconButton configuratorModalCloseButton"
          onClick={handleClose}
          aria-label="Close"
        >
          X
        </button>
        {isPreviewOpen && (
          <button
            type="button"
            className="configuratorModalIconButton configuratorModalBackButton"
            onClick={() => setIsPreviewOpen(false)}
            aria-label="Back"
          >
            &lt;
          </button>
        )}
        {/* BODY */}
        {!isPreviewOpen ? (
          <div className="configuratorModalBody">
            <div className="configuratorModalLeft">
              <Configurator
                imageUrl={imageUrl}
                width={widthCm}
                height={heightCm}
                onCropChange={onCropChange}
                onPreviewClick={() => setIsPreviewOpen(true)}
              />
            </div>

            <div className="configuratorModalRight">
              {/* <div>
                <strong>Selected size</strong>
                <div>
                  {widthCm} cm × {heightCm} cm
                </div>
              </div> */}

              {/* <div style={{marginTop: '1rem'}}>
                <strong>Crop status</strong>
                <div>
                  {crop ? 'Crop selected' : 'No crop selected'}
                </div>
              </div> */}

              {qualityOptions && (
                <div>
                  {qualityOptions}
                </div>
              )}
              <div style={{marginTop: '16px'}}>
                <button
                  type="button"
                  className="configuratorPreviewButton"
                  disabled={!crop}
                  onClick={() => setIsPreviewOpen(true)}
                >
                  Confirm &amp; Generate Live Preview
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="configuratorModalBody">
            {/* <ConfigratorScene
              isOpen={isPreviewOpen}
              onClose={() => setIsPreviewOpen(false)}
              confirmButton={confirmButton}
              inline
              showCloseButton={false}
              imageUrl={imageUrl}
              widthCm={widthCm}
              heightCm={heightCm}
              crop={crop}
            /> */}
            <ConfigratorScene2
              isOpen={isPreviewOpen}
              onClose={() => setIsPreviewOpen(false)}
              confirmButton={confirmButton}
              inline
              showCloseButton={false}
              imageUrl={imageUrl}
              widthCm={widthCm}
              heightCm={heightCm}
              crop={crop}
            />
          </div>
        )}
      </div>
    </div>
  );
}


