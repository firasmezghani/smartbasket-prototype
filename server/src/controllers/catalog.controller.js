import { asyncHandler } from '../utils/asyncHandler.js';
import * as catalogService from '../services/catalog.service.js';

// Catalogue endpoints (read only). Invalid product ids return 400.

// Paginated product list; limit/offset/search/filters normalized and clamped in service.
export const listProducts = asyncHandler(async (req, res) => {
  const { products, total, limit, offset } = await catalogService.getProducts({
    search: req.query.search,
    family: req.query.family,
    brand: req.query.brand,
    subfamily: req.query.subfamily,
    site: req.query.site,
    limit: req.query.limit,
    offset: req.query.offset,
    sort: req.query.sort,
    hasPromo: req.query.hasPromo,
    displayCategory: req.query.displayCategory,
    featured: req.query.featured,
    curated: req.query.curated,
  });

  res.status(200).json({
    data: products,
    pagination: {
      limit,
      offset,
      total,
      hasMore: offset + products.length < total,
    },
  });
});

// Catalogue landing sections with the number of products in each.
export const listSections = asyncHandler(async (_req, res) => {
  const data = await catalogService.getCatalogSections();
  res.status(200).json({ data });
});

export const getProductByBarcode = asyncHandler(async (req, res) => {
  const barcode = catalogService.parseCatalogBarcode(req.params.barcode);
  if (!barcode) {
    return res.status(400).json({ message: 'Invalid barcode.' });
  }
  const product = await catalogService.getProductByBarcode(barcode);
  if (!product) {
    return res.status(404).json({ message: 'Product not found.' });
  }
  res.status(200).json({
    data: product,
    lookup: { matchedCodBar: barcode, matchCount: 1 },
  });
});

export const getProductDetails = asyncHandler(async (req, res) => {
  const { idArt } = req.params;
  const artId = catalogService.parseCatalogProductId(idArt);
  if (!artId) {
    return res.status(400).json({ message: 'Invalid product identifier.' });
  }
  const product = await catalogService.getProductById(artId);
  if (!product) {
    return res.status(404).json({ message: 'Product not found.' });
  }
  res.status(200).json({ data: product });
});

// Binary image only for one product; list/detail queries must not select imgArt.
export const getProductImage = asyncHandler(async (req, res) => {
  const { idArt } = req.params;
  const artId = catalogService.parseCatalogProductId(idArt);
  if (!artId) {
    return res.status(400).json({ message: 'Invalid product identifier.' });
  }
  const payload = await catalogService.getProductImage(artId);
  if (!payload) {
    return res.status(404).json({ message: 'Product image not found.' });
  }
  const { image, contentType } = payload;
  res.setHeader('Content-Type', contentType);
  // One row, one blob; safe to cache publicly for a day (images rarely change per SKU).
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(image);
});

export const listProductBarcodes = asyncHandler(async (req, res) => {
  const { idArt } = req.params;
  const artId = catalogService.parseCatalogProductId(idArt);
  if (!artId) {
    return res.status(400).json({ message: 'Invalid product identifier.' });
  }
  const barcodes = await catalogService.getProductBarcodes(artId);
  res.status(200).json({ data: barcodes });
});

export const listFamilies = asyncHandler(async (req, res) => {
  const families = await catalogService.getFamilies();
  res.status(200).json({ data: families });
});

export const listSubFamilies = asyncHandler(async (req, res) => {
  const subfamilies = await catalogService.getSubFamilies(req.query.family);
  res.status(200).json({ data: subfamilies });
});

export const listBrands = asyncHandler(async (req, res) => {
  const brands = await catalogService.getBrands();
  res.status(200).json({ data: brands });
});
