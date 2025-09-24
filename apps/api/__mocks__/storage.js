// Mock for @bloxtr8/storage package
const createPresignedPutUrl = key => {
  return Promise.resolve(
    `https://mock-s3-bucket.s3.amazonaws.com/${key}?mock-presigned-put`
  );
};

const createPresignedGetUrl = key => {
  return Promise.resolve(
    `https://mock-s3-bucket.s3.amazonaws.com/${key}?mock-presigned-get`
  );
};

module.exports = {
  createPresignedPutUrl,
  createPresignedGetUrl,
};
