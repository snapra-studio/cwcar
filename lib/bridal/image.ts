// Shrinks an uploaded photo to a JPEG data URL small enough (~100–200 KB) to
// send to the server and keep in the database with the rest of the data.
export async function fileToCarImage(file: File, maxWidth = 1200): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Not an image")
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxWidth / bitmap.width)
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas.toDataURL("image/jpeg", 0.82)
}
