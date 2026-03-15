import { Platform } from 'react-native';

// Cloudinary Configuration
const CLOUD_NAME = 'dinpseh3h';
const UPLOAD_PRESET = 'Videos'; 

/**
 * Standardizes URI for React Native FormData
 */
const normalizeUri = (uri: string) => {
  return uri.startsWith('file://') ? uri : `file://${uri}`;
};

export const uploadFile = async (uri: string, filename: string, mimeType: string): Promise<{ url: string }> => {
  try {
    console.log('Starting Cloudinary upload:', { filename, mimeType, platform: Platform.OS });
    
    // In React Native, FormData works best with the { uri, name, type } object pattern
    // However, on Web, we need to send an actual File or Blob.
    const formData = new FormData();
    
    let fileToUpload: any;

    if (Platform.OS === 'web') {
      // On Web, fetching the URI and converting to Blob is the most reliable way
      const response = await fetch(uri);
      fileToUpload = await response.blob();
    } else {
      // On Native, use the standard RN object pattern
      fileToUpload = {
        uri: normalizeUri(uri),
        name: filename,
        type: mimeType,
      };
    }

    formData.append('file', fileToUpload);
    formData.append('upload_preset', UPLOAD_PRESET);
    formData.append('cloud_name', CLOUD_NAME);

    // Using XHR for better progress tracking and large file support in RN
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`, true);

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            console.log('Cloudinary Upload complete! URL:', response.secure_url);
            resolve({ url: response.secure_url });
          } catch (e) {
            reject(new Error('Failed to parse Cloudinary response.'));
          }
        } else {
          console.error('Cloudinary Error Status:', xhr.status);
          console.error('Cloudinary Error Body:', xhr.responseText);
          reject(new Error(`Server error: ${xhr.status}. Check your preset settings.`));
        }
      };

      xhr.onerror = (e) => {
        console.error('XHR Network Error:', e);
        reject(new Error('Network error. Please check your internet or Cloudinary config.'));
      };

      // Progress logging
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const progress = (event.loaded / event.total) * 100;
          console.log(`Cloudinary Upload progress: ${Math.round(progress)}%`);
        }
      };

      xhr.send(formData);
    });

  } catch (error: any) {
    console.error('Upload Process Error:', error.message);
    throw error;
  }
};

/**
 * Convenience wrapper for uploading images
 */
export const uploadImage = async (uri: string): Promise<{ url: string }> => {
  const filename = uri.split('/').pop() || `image-${Date.now()}.jpg`;
  const mimeType = 'image/jpeg';
  return uploadFile(uri, filename, mimeType);
};
