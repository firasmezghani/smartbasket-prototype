import { Router } from 'express';
import * as catalogController from '../controllers/catalog.controller.js';

export const catalogRoutes = Router();

catalogRoutes.get('/products', catalogController.listProducts);
catalogRoutes.get('/sections', catalogController.listSections);
catalogRoutes.get('/products/by-barcode/:barcode', catalogController.getProductByBarcode);
catalogRoutes.get('/products/:idArt/image', catalogController.getProductImage);
catalogRoutes.get('/products/:idArt/barcodes', catalogController.listProductBarcodes);
catalogRoutes.get('/products/:idArt', catalogController.getProductDetails);
catalogRoutes.get('/families', catalogController.listFamilies);
catalogRoutes.get('/subfamilies', catalogController.listSubFamilies);
catalogRoutes.get('/brands', catalogController.listBrands);
