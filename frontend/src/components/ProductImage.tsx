import React from "react";
import { Loader2, ImageOff } from "lucide-react";
import { useProductImage } from "@/hooks/useProductImage";

interface ProductImageProps {
  imageUrl?: string;
  alt: string;
  className?: string;
  fallbackClassName?: string;
}

export const ProductImage: React.FC<ProductImageProps> = ({
  imageUrl,
  alt,
  className = "h-full w-full object-cover",
  fallbackClassName = "h-5 w-5 text-[#9CA3AF]",
}) => {
  const { src, loading, error } = useProductImage(imageUrl);

  return (
    <div className={`relative overflow-hidden flex items-center justify-center ${className}`}>
      {loading ? (
        <div className="absolute inset-0 flex items-center justify-center bg-[#F3F4F6] animate-pulse">
          <Loader2 className="h-4 w-4 animate-spin text-[#FBBF24]" />
        </div>
      ) : error || !src ? (
        <div className="absolute inset-0 flex items-center justify-center bg-[#F3F4F6]">
          <ImageOff className={fallbackClassName} />
        </div>
      ) : (
        <img src={src} alt={alt} className="h-full w-full object-cover" />
      )}
    </div>
  );
};
