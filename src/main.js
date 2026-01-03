// ===------------------------------------------------------------------===
// Domain
// ===------------------------------------------------------------------===

class OrderItem {
  constructor({ sku, discount, quantity, salePrice }) {
    this.sku = sku;
    this.discount = discount;
    this.quantity = quantity;
    this.salePrice = salePrice;
  }
}

class OrderLine {
  constructor({ receiptId, sellerId, items, totalAmount }) {
    this.receiptId = receiptId;
    this.sellerId = sellerId;
    this.items = items;
    this.totalAmount = totalAmount;
  }
}

class Seller {
  constructor({ id, firstName, lastName }) {
    this.id = id;
    this.firstName = firstName;
    this.lastName = lastName;
  }
}

class Product {
  constructor({ sku, purchasePrice }) {
    this.sku = sku;
    this.purchasePrice = purchasePrice;
  }
}

// ===------------------------------------------------------------------===
// Ports
// ===------------------------------------------------------------------===

class ISellerRepository {
  getIndexed() {}
}

class IProductRepository {
  getIndexed() {}
}

class IMarketRepository {
  getPurchases() {}
}

// ===------------------------------------------------------------------===
// Application
// ===------------------------------------------------------------------===

class SellerStats {
  constructor({ seller, revenue, profit, salesCount, productsSold }) {
    this.seller = seller;
    this.revenue = revenue;
    this.profit = profit;
    this.salesCount = salesCount;
    this.productsSold = productsSold;
  }
}

/**
 * Функция для расчета бонусов
 * @param index порядковый номер в отсортированном массиве
 * @param total общее число продавцов
 * @param seller карточка продавца
 * @returns {number}
 */
function calculateBonusByProfit(index, total, seller) {
  const WINNER_BONUS_PERCENTAGE = 15;
  const PRIZEWINNER_BONUS_PERCENTAGE = 10;
  const COMMON_BONUS_PERCENTAGE = 5;

  const rank = index + 1;

  let percentage = 0;
  if (rank === 1) {
    percentage = WINNER_BONUS_PERCENTAGE;
  } else if (rank === 2 || rank === 3) {
    percentage = PRIZEWINNER_BONUS_PERCENTAGE;
  } else if (rank !== total) {
    percentage = COMMON_BONUS_PERCENTAGE;
  }

  const profit = Math.round(((seller.profit * percentage) / 100) * 100) / 100;
  return profit;
}

/**
 * Функция для расчета выручки
 * @param purchase запись о покупке
 * @param _product карточка товара
 * @returns {number}
 */
function calculateSimpleRevenue(purchase, _product) {
  const { discount, sale_price, quantity } = purchase;

  const decimalDiscount = discount / 100;
  const overallPrice = sale_price * quantity;
  const revenue = overallPrice * (1 - decimalDiscount);

  return revenue;
}

class GetSellerStatsView {
  #sellerRepo;
  #marketRepo;
  #productRepo;
  #revenueCallback;

  constructor({ sellerRepo, marketRepo, productRepo, revenueCallback }) {
    this.#sellerRepo = sellerRepo;
    this.#marketRepo = marketRepo;
    this.#productRepo = productRepo;
    this.#revenueCallback = revenueCallback;
  }

  execute() {
    const sellers = this.#sellerRepo.getIndexed();
    const purchases = this.#marketRepo.getPurchases();
    const products = this.#productRepo.getIndexed();

    const sellerStatsMap = {};
    for (const orderLine of purchases) {
      if (!(orderLine.sellerId in sellerStatsMap)) {
        const sellerStats = new SellerStats({
          seller: sellers[orderLine.sellerId],
          revenue: 0,
          profit: 0,
          salesCount: 0,
          productsSold: {},
        });
        sellerStatsMap[sellerStats.seller.id] = sellerStats;
      }

      const sellerStats = sellerStatsMap[orderLine.sellerId];
      sellerStats.salesCount++;
      sellerStats.revenue += orderLine.totalAmount;

      const items = orderLine.items;
      for (const item of items) {
        const revenue = this.#revenueCallback(item);
        const investments = products[item.sku].purchasePrice * item.quantity;

        sellerStats.profit += revenue - investments;

        if (!(item.sku in sellerStats.productsSold)) {
          sellerStats.productsSold[item.sku] = 0;
        }

        sellerStats.productsSold[item.sku] += item.quantity;
      }
    }

    for (const [sellerId, stats] of Object.entries(sellerStatsMap)) {
      const productsSold = Object.entries(stats.productsSold);
      const productsSoldNormalized = [];
      for (const [sku, quantity] of productsSold) {
        productsSoldNormalized.push({ sku: sku, quantity: quantity });
      }
      sellerStatsMap[sellerId].productsSold = productsSoldNormalized;
    }
    return Object.values(sellerStatsMap);
  }
}

// ===------------------------------------------------------------------===
// Exceptions
// ===------------------------------------------------------------------===

class NoDataError extends Error {
  constructor(message) {
    super(message);
  }
}

class InvalidDataError extends Error {
  constructor(message) {
    super(message);
  }
}

// ===------------------------------------------------------------------===
// Infrastructure
// ===------------------------------------------------------------------===

class MarketLocalDatabase extends IMarketRepository {
  #data;

  constructor(data) {
    super();
    this.#data = data;
  }

  getPurchases() {
    const purchases = [];
    for (const purchaseData of this.#data.purchase_records) {
      const itemList = [];
      for (const itemData of purchaseData.items) {
        const orderItem = new OrderItem({
          sku: itemData.sku,
          quantity: itemData.quantity,
          salePrice: itemData.sale_price,
          discount: itemData.discount,
        });
        itemList.push(orderItem);
      }

      const purchase = new OrderLine({
        receiptId: purchaseData.receipt_id,
        sellerId: purchaseData.seller_id,
        items: itemList,
        totalAmount: purchaseData.total_amount,
      });
      purchases.push(purchase);
    }

    return purchases;
  }
}

class SellerLocalDatabase extends ISellerRepository {
  #data;

  constructor(data) {
    super();
    this.#data = data;
  }

  getIndexed() {
    const sellerIndex = {};
    for (const sellerData of this.#data.sellers) {
      const seller = new Seller({
        id: sellerData.id,
        firstName: sellerData.first_name,
        lastName: sellerData.last_name,
      });
      sellerIndex[seller.id] = seller;
    }
    return sellerIndex;
  }
}

class ProductLocalDatabase extends IProductRepository {
  #data;

  constructor(data) {
    super();
    this.#data = data;
  }

  getIndexed() {
    const productIndex = {};
    for (const productData of this.#data.products) {
      const product = new Product({
        sku: productData.sku,
        purchasePrice: productData.purchase_price,
      });
      productIndex[product.sku] = product;
    }
    return productIndex;
  }
}

// ===------------------------------------------------------------------===
// Main
// ===------------------------------------------------------------------===

/**
 * Функция для анализа данных продаж
 * @param data
 * @param options
 * @returns {{revenue, top_products, bonus, name, salesCount, profit, sellerId}[]}
 */
function analyzeSalesData(data, options) {
  if (!data) {
    throw new NoDataError('No data provided');
  }

  if (!data.purchase_records || data.purchase_records.length == 0) {
    throw new NoDataError('No purchase data provided');
  }

  if (!Array.isArray(data.sellers) || data.sellers.length == 0) {
    throw new InvalidDataError('Invalid data format');
  }

  const { calculateRevenue, calculateBonus } = options;

  if (
    typeof calculateRevenue !== 'function' ||
    typeof calculateBonus !== 'function'
  ) {
    throw new InvalidDataError('Invalid functions provided');
  }

  const sellerRepo = new SellerLocalDatabase(data);
  const marketRepo = new MarketLocalDatabase(data);
  const productRepo = new ProductLocalDatabase(data);

  const uc = new GetSellerStatsView({
    sellerRepo: sellerRepo,
    marketRepo: marketRepo,
    productRepo: productRepo,
    revenueCallback: calculateRevenue,
  });
  const sellerStatsList = uc.execute();
  sellerStatsList.sort((a, b) => b.profit - a.profit);

  sellerStatsList.map((value, index) => {
    value.bonus = calculateBonus(index, sellerStatsList.length, value);
  });

  const representations = [];
  for (const sellerStats of sellerStatsList) {
    sellerStats.productsSold.sort((a, b) => b.quantity - a.quantity);

    const representation = {
      sellerId: sellerStats.seller.id,
      name: `${sellerStats.seller.firstName} ${sellerStats.seller.lastName}`,
      revenue: +sellerStats.revenue.toFixed(2),
      profit: +sellerStats.profit.toFixed(2),
      salesCount: sellerStats.salesCount,
      top_products: sellerStats.productsSold.slice(0, 10),
      bonus: +sellerStats.bonus.toFixed(2),
    };

    representations.push(representation);
  }

  return representations;
}
