import { asyncHandler } from '../utils/asyncHandler.js';
import * as purchaseHistoryService from '../services/purchaseHistory.service.js';

export const listPurchaseHistory = asyncHandler(async (req, res) => {
  const data = await purchaseHistoryService.listPurchaseHistory(req.customerId);
  res.status(200).json({
    data,
    meta: {
      limit: purchaseHistoryService.PURCHASE_HISTORY_LIMIT,
      note: 'At most 10 validated smart-basket records are displayed. Display limiting does not delete database history.',
    },
  });
});

export const getPurchaseHistoryRecord = asyncHandler(async (req, res) => {
  const data = await purchaseHistoryService.getPurchaseHistoryDetail(
    req.customerId,
    req.params.recordId,
  );
  res.status(200).json({ data });
});
