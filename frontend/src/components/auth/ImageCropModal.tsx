import React, { useState, useRef, useEffect } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, Check, X, Crop } from 'lucide-react';
import { Button } from '../ui/Button';

interface ImageCropModalProps {
  isOpen: boolean;
  imageSrc: string;
  onClose: () => void;
  onCropComplete: (croppedDataUrl: string) => void;
}

export const ImageCropModal: React.FC<ImageCropModalProps> = ({
  isOpen,
  imageSrc,
  onClose,
  onCropComplete,
}) => {
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  // Load image
  useEffect(() => {
    if (!imageSrc) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imageRef.current = img;
      setPosition({ x: 0, y: 0 });
      setZoom(1);
      drawPreview();
    };
    img.src = imageSrc;
  }, [imageSrc]);

  // Redraw when zoom or position changes
  useEffect(() => {
    drawPreview();
  }, [zoom, position]);

  const drawPreview = () => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 260;
    canvas.width = size;
    canvas.height = size;

    ctx.clearRect(0, 0, size, size);

    // Save context for clipping circular preview
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.clip();

    // Dark backdrop inside circle
    ctx.fillStyle = '#061638';
    ctx.fillRect(0, 0, size, size);

    // Calculate dimensions
    const scale = (Math.max(size / img.width, size / img.height)) * zoom;
    const scaledWidth = img.width * scale;
    const scaledHeight = img.height * scale;

    const drawX = (size - scaledWidth) / 2 + position.x;
    const drawY = (size - scaledHeight) / 2 + position.y;

    ctx.drawImage(img, drawX, drawY, scaledWidth, scaledHeight);
    ctx.restore();
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleReset = () => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  };

  const handleApply = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Export circular preview as base64 png
    const dataUrl = canvas.toDataURL('image/png');
    onCropComplete(dataUrl);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200 select-none">
      <div 
        className="relative w-full max-w-md rounded-3xl bg-[#051438]/95 border-2 border-[#00d2ff] p-6 shadow-[0_0_50px_rgba(0,210,255,0.4)] flex flex-col items-center"
      >
        {/* Header */}
        <div className="w-full flex items-center justify-between pb-3 border-b border-sky-400/20">
          <div className="flex items-center gap-2 text-white font-bold text-lg">
            <Crop className="h-5 w-5 text-[#00d2ff]" />
            <span>Crop Company Logo</span>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="text-xs text-sky-200/80 my-3 text-center">
          Drag to reposition and adjust zoom slider to crop your company logo badge.
        </p>

        {/* Circular Canvas Preview Container */}
        <div 
          className="relative w-[260px] h-[260px] rounded-full border-2 border-dashed border-[#00d2ff] shadow-[0_0_25px_rgba(0,210,255,0.5)] overflow-hidden cursor-grab active:cursor-grabbing my-2"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <canvas ref={canvasRef} className="w-full h-full block" />
          {/* Subtle grid watermark */}
          <div className="absolute inset-0 rounded-full pointer-events-none border border-sky-400/40" />
        </div>

        {/* Zoom & Adjustment Controls */}
        <div className="w-full flex items-center justify-between gap-3 mt-4 px-2">
          <ZoomOut className="h-4 w-4 text-sky-300" />
          <input
            type="range"
            min="0.8"
            max="3"
            step="0.05"
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            className="w-full accent-[#00d2ff] cursor-pointer"
          />
          <ZoomIn className="h-4 w-4 text-sky-300" />
          <button
            type="button"
            onClick={handleReset}
            title="Reset position and zoom"
            className="p-1.5 rounded-lg text-sky-300 hover:text-white hover:bg-sky-500/20 transition-all cursor-pointer"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>

        {/* Actions */}
        <div className="w-full flex items-center justify-end gap-3 mt-6 pt-3 border-t border-sky-400/20">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-300 hover:text-white hover:bg-slate-800/60 transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="px-6 py-2 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 shadow-[0_0_15px_rgba(0,210,255,0.6)] flex items-center gap-2 transition-all cursor-pointer"
          >
            <Check className="h-4 w-4" />
            <span>Apply Crop</span>
          </button>
        </div>
      </div>
    </div>
  );
};
