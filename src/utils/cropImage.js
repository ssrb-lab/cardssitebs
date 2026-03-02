/**
 * Ця функція бере оригінальне зображення і координати обрізки (у відсотках або пікселях)
 * та повертає новий Blob зі збереженою вирізаною частиною.
 */
export const getCroppedImg = async (imageSrc, pixelCrop) => {
    const image = await createImage(imageSrc);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
        return null;
    }

    // Налаштування розміру canvas відповідно до розміру обрізки
    canvas.width = pixelCrop.width;
    canvas.height = pixelCrop.height;

    // Малюємо обрізану частину оригінального фото на canvas
    ctx.drawImage(
        image,
        pixelCrop.x,
        pixelCrop.y,
        pixelCrop.width,
        pixelCrop.height,
        0,
        0,
        pixelCrop.width,
        pixelCrop.height
    );

    // Конвертуємо canvas назад у Blob (файл)
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (!blob) {
                reject(new Error('Canvas is empty'));
                return;
            }
            blob.name = 'avatar.jpg';
            // Створюємо File об'єкт
            const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
            resolve({ file, url: URL.createObjectURL(blob) });
        }, 'image/jpeg');
    });
};

const createImage = (url) =>
    new Promise((resolve, reject) => {
        const image = new Image();
        image.addEventListener('load', () => resolve(image));
        image.addEventListener('error', (error) => reject(error));
        image.setAttribute('crossOrigin', 'anonymous'); // Для уникнення проблем з CORS
        image.src = url;
    });
