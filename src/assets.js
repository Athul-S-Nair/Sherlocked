// Loads the scene art by filename. A file that is missing (or fails to decode) stays null,
// and the scene draws its placeholder instead, so art can be dropped in one file at a time.
export function loadImages(manifest) {
  const images = {};
  for (const [name, url] of Object.entries(manifest)) {
    images[name] = null;
    const img = new Image();
    img.onload = () => { images[name] = img; };
    img.src = url;
  }
  return images;
}
