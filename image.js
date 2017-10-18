const Jimp = require('jimp');

let imageCount = 0;

const createImage = async (baseImageUrl = 'https://cdn.shopify.com/s/files/1/1462/0734/products/1_800x_fb4264c3-eeb8-447a-a272-4c3655b176bf.jpg?v=1508255086', faceUrl = 'https://scontent.fybz2-2.fna.fbcdn.net/v/t34.0-0/p480x480/22627687_10105582247243852_469043412_n.png?oh=c25d6b7a9ddbecd18f5534e4edb93ece&oe=59E926BE') => {
  return new Promise((resolve, reject) => {
    Jimp.read(baseImageUrl).then(base => {
      Jimp.read(faceUrl).then(face => {
        const resizedBase = base.resize(800, Jimp.AUTO);
        const resizedFace = face.resize(160, Jimp.AUTO);
        const xPosition = 340;
        const yPosition = 10;//resizedBase.bitmap.width;
        const newImage = resizedBase.composite(resizedFace, xPosition, yPosition);
        const imageName = `image-${imageCount}.jpg`;
        newImage.write(`public/images/${imageName}`, function(error, result) {
          imageCount ++;
          resolve(imageName)
        });
      })
    })
  })
}

module.exports = createImage;