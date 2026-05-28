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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-[#F3F4F6] animate-pulse">
        <Loader2 className="h-4 w-4 animate-spin text-[#FBBF24]" />
      </div>
    );
  }

  if (error || !src) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-[#F3F4F6]">
        <ImageOff className={fallbackClassName} />
      </div>
    );
  }

  return <img src={src} alt={alt} className={className} />;
};
