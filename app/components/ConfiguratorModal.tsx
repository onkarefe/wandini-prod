import React, {useEffect, useState} from 'react';
import {Configurator} from './Configurator';
import {ConfigratorScene2} from './ConfigratorScene2';

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

export type ConfiguratorMaterialOption = {
  id: string;
  title: string;
  pricePerSquareMeter: string;
  priceBeforeDiscount: string | null;
  calculatedPrice: string;
  properties: string[];
  isBestseller: boolean;
  selected: boolean;
  exists: boolean;
  variantUriQuery: string;
};

type ConfiguratorStep = 'crop' | 'materials' | 'preview';

type ConfiguratorModalProps = {
  isOpen: boolean;
  onClose: () => void;
  materialOptions: ConfiguratorMaterialOption[];
  onMaterialSelect: (
    material: ConfiguratorMaterialOption,
  ) => void | Promise<void>;
  selectedQualitySummary?: SelectedQualitySummary;
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
  materialOptions,
  onMaterialSelect,
  selectedQualitySummary,
  confirmButton,
}: ConfiguratorModalProps) {
  const [step, setStep] = useState<ConfiguratorStep>('crop');
  const [selectingMaterialId, setSelectingMaterialId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!isOpen) return;

    const scrollY = window.scrollY;
    const {style} = document.body;
    const prev = {
      overflow: style.overflow,
      position: style.position,
      top: style.top,
      left: style.left,
      right: style.right,
      width: style.width,
    };

    style.overflow = 'hidden';
    style.position = 'fixed';
    style.top = `-${scrollY}px`;
    style.left = '0';
    style.right = '0';
    style.width = '100%';

    return () => {
      style.overflow = prev.overflow;
      style.position = prev.position;
      style.top = prev.top;
      style.left = prev.left;
      style.right = prev.right;
      style.width = prev.width;
      window.scrollTo(0, scrollY);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClose = () => {
    setStep('crop');
    setSelectingMaterialId(null);
    onClose();
  };

  const handleBack = () => {
    setStep((currentStep) =>
      currentStep === 'preview' ? 'materials' : 'crop',
    );
  };

  const handleMaterialSelect = async (
    material: ConfiguratorMaterialOption,
  ) => {
    if (!material.exists || selectingMaterialId) return;

    setSelectingMaterialId(material.id);
    try {
      await onMaterialSelect(material);
      setStep('preview');
    } finally {
      setSelectingMaterialId(null);
    }
  };

  return (
    <div className="configuratorModalOverlay" role="presentation">
      <div
        className="configuratorModalBackdrop"
        aria-hidden="true"
      />
      <div
        className={`configuratorModal configuratorModal--${step}`}
        role="dialog"
        aria-modal="true"
        aria-label="Produktkonfigurator"
      >
        <button
          type="button"
          className="configuratorModalIconButton configuratorModalCloseButton"
          onClick={handleClose}
          aria-label="Schließen"
        >
          X
        </button>

        {step !== 'crop' && (
          <button
            type="button"
            className="configuratorModalIconButton configuratorModalBackButton"
            onClick={handleBack}
            aria-label="Zurück"
          >
            &lt;
          </button>
        )}

        {step === 'crop' && (
          <div className="configuratorModalBody configuratorModalBody--crop">
            <div className="configuratorModalLeft">
              <Configurator
                imageUrl={imageUrl}
                width={widthCm}
                height={heightCm}
                onCropChange={onCropChange}
              />
            </div>

            <div className="configuratorCropActions">
              <button
                type="button"
                className="configuratorPreviewButton"
                disabled={!crop}
                onClick={() => setStep('materials')}
              >
                Weiter zur Materialauswahl
              </button>
            </div>
          </div>
        )}

        {step === 'materials' && (
          <div className="configuratorModalBody configuratorModalBody--materials">
            <section
              className="configuratorMaterials"
              aria-labelledby="configurator-materials-title"
            >
              <header className="configuratorMaterialsHeader">
                <span className="configuratorMaterialsEyebrow">
                  Schritt 2 von 3
                </span>
                <h2 id="configurator-materials-title">
                  Druckmaterial auswählen
                </h2>
                <p>
                  Wählen Sie die passende Druckqualität für Ihre Wandfläche von{' '}
                  {widthCm} × {heightCm} cm.
                </p>
              </header>

              <div className="configuratorMaterialsGrid">
                {materialOptions.map((material) => {
                  const isSelecting = selectingMaterialId === material.id;
                  const isSelectionPending = selectingMaterialId !== null;

                  return (
                    <article
                      key={material.id}
                      className={`configuratorMaterialCard${
                        material.selected
                          ? ' configuratorMaterialCard--selected'
                          : ''
                      }`}
                    >
                      <div className="configuratorMaterialPrice">
                        {material.priceBeforeDiscount && (
                          <del>{material.priceBeforeDiscount}</del>
                        )}
                        <div className="configuratorMaterialCurrentPrice">
                          <strong>{material.pricePerSquareMeter}</strong>
                          <span>pro m²</span>
                        </div>
                      </div>

                      <div className="configuratorMaterialTitleRow">
                        <h3>{material.title}</h3>
                        {material.isBestseller && (
                          <span className="configuratorMaterialBestseller">
                            <span aria-hidden="true">★</span>
                            Bestseller
                          </span>
                        )}
                      </div>

                      <ul className="configuratorMaterialFeatures">
                        {material.properties.map((property) => (
                          <li key={`${material.id}-${property}`}>{property}</li>
                        ))}
                      </ul>

                      <div className="configuratorMaterialTotal">
                        <span>Preis für Ihre Maße</span>
                        <strong>{material.calculatedPrice}</strong>
                      </div>

                      <button
                        type="button"
                        className="configuratorMaterialSelectButton"
                        disabled={!material.exists || isSelectionPending}
                        onClick={() => void handleMaterialSelect(material)}
                      >
                        {isSelecting
                          ? 'Wird ausgewählt…'
                          : 'Material auswählen'}
                      </button>
                    </article>
                  );
                })}
              </div>
            </section>
          </div>
        )}

        {step === 'preview' && (
          <div className="configuratorModalBody">
            <ConfigratorScene2
              isOpen
              onClose={() => setStep('materials')}
              confirmButton={confirmButton}
              inline
              showCloseButton={false}
              imageUrl={imageUrl}
              widthCm={widthCm}
              heightCm={heightCm}
              crop={crop}
              selectedQualitySummary={selectedQualitySummary}
            />
          </div>
        )}
      </div>
    </div>
  );
}
