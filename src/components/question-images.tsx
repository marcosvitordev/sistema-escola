import type { QuestionView } from '@/lib/assessment-types';

export type PreviewImage = { src: string; caption: string };
export function ImageGallery({ images }: { images: PreviewImage[] }) {
  if (!images.length) return null;
  return <div className="question-image-gallery">{images.map((image, i) => <figure key={`${image.src}:${i}`}><img className="question-image" src={image.src} alt={image.caption} loading="lazy" /><figcaption>{image.caption}</figcaption></figure>)}</div>;
}
export function QuestionImages({ question, index }: { question: QuestionView; index: number }) {
  const images = question.images?.length ? question.images.map(image => ({ src: `/api/assessments/files/${image.id}`, caption: image.name.replace(/\.(png|jpe?g)$/i, '') })) : question.imageId ? [{ src: `/api/assessments/files/${question.imageId}`, caption: `Imagem da questão ${index + 1}` }] : [];
  return <ImageGallery images={images} />;
}
