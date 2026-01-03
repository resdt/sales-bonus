// ===------------------------------------------------------------------===
// Domain
// ===------------------------------------------------------------------===

class OrderItem {
  constructor({ sku, discount, quantity, sale_price }) {
    this.sku = sku;
    this.discount = discount;
    this.quantity = quantity;
    this.sale_price = sale_price;
  }
}

class OrderLine {
  constructor({ receipt_id, seller_id, customer_id, items }) {
    this.receipt_id = receipt_id;
    this.seller_id = seller_id;
    this.customer_id = customer_id;
    this.items = items;
  }
}

class Seller {
  constructor({ id, first_name, last_name }) {
    this.id = id;
    this.first_name = first_name;
    this.last_name = last_name;
  }
}

class Product {
  constructor({ sku, purchase_price }) {
    this.sku = sku;
    this.purchase_price = purchase_price;
  }
}

// ===------------------------------------------------------------------===
// Ports
// ===------------------------------------------------------------------===

class ISellerRepository {
  get_indexed() {}
}

class IProductRepository {
  get_indexed() {}
}

class IMarketRepository {
  get_purchases() {}
}

// ===------------------------------------------------------------------===
// Application
// ===------------------------------------------------------------------===

class SellerStats {
  constructor({ seller, revenue, profit, sales_count, products_sold }) {
    this.seller = seller;
    this.revenue = revenue;
    this.profit = profit;
    this.sales_count = sales_count;
    this.products_sold = products_sold;
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

  const profitInCents = Math.round(seller.profit * 100);
  const bonusInCents = Math.floor((profitInCents * percentage) / 100);

  return bonusInCents / 100;
}

/**
 * Функция для расчета выручки
 * @param purchase запись о покупке
 * @param _product карточка товара
 * @returns {number}
 */
function calculateSimpleRevenue(purchase, _product) {
  const { discount, sale_price, quantity } = purchase;

  const priceInCents = Math.round(sale_price * 100);
  const revenueInCents = (priceInCents * quantity * (100 - discount)) / 100;

  return Math.round(revenueInCents) / 100;
}

class GetSellerStatsView {
  #seller_repo;
  #market_repo;
  #product_repo;
  #revenue_callback;

  constructor({ seller_repo, market_repo, product_repo, revenue_callback }) {
    this.#seller_repo = seller_repo;
    this.#market_repo = market_repo;
    this.#product_repo = product_repo;
    this.#revenue_callback = revenue_callback;
  }

  execute() {
    const sellers = this.#seller_repo.get_indexed();
    const purchases = this.#market_repo.get_purchases();
    const products = this.#product_repo.get_indexed();

    const seller_stats_map = {};
    for (let order_line of purchases) {
      if (!(order_line.seller_id in seller_stats_map)) {
        const seller_stats = new SellerStats({
          seller: sellers[order_line.seller_id],
          revenue: 0,
          profit: 0,
          sales_count: 0,
          products_sold: {},
        });
        seller_stats_map[seller_stats.seller.id] = seller_stats;
      }

      const seller_stats = seller_stats_map[order_line.seller_id];
      seller_stats.sales_count++;

      const items = order_line.items;
      for (let item of items) {
        const revenue = this.#revenue_callback(item);
        const investments = products[item.sku].purchase_price * item.quantity;

        seller_stats.revenue += revenue;
        seller_stats.profit += revenue - investments;

        if (!(item.sku in seller_stats.products_sold)) {
          seller_stats.products_sold[item.sku] = 0;
        }
      }
    }

    for (const [seller_id, stats] of Object.entries(seller_stats_map)) {
      const products_sold = Object.entries(stats.products_sold);
      const products_sold_normalized = [];
      for (const [sku, quantity] of products_sold) {
        products_sold_normalized.push({ sku: sku, quantity: quantity });
      }
      seller_stats_map[seller_id].products_sold = products_sold_normalized;
    }
    return Object.values(seller_stats_map);
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

  get_purchases() {
    const purchases = [];
    for (let purchase_data of this.#data.purchase_records) {
      const item_list = [];
      for (let item_data of purchase_data.items) {
        const order_item = new OrderItem({
          sku: item_data.sku,
          quantity: item_data.quantity,
          sale_price: item_data.sale_price,
          discount: item_data.discount,
        });
        item_list.push(order_item);
      }

      const purchase = new OrderLine({
        receipt_id: purchase_data.receipt_id,
        seller_id: purchase_data.seller_id,
        customer_id: purchase_data.customer_id,
        items: item_list,
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

  get_indexed() {
    const sellerIndex = {};
    for (let seller_data of this.#data.sellers) {
      const seller = new Seller({
        id: seller_data.id,
        first_name: seller_data.first_name,
        last_name: seller_data.last_name,
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

  get_indexed() {
    const productIndex = {};
    for (let product_data of this.#data.products) {
      const product = new Product({
        sku: product_data.sku,
        purchase_price: product_data.purchase_price,
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
 * @returns {{revenue, top_products, bonus, name, sales_count, profit, seller_id}[]}
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

  const seller_repo = new SellerLocalDatabase(data);
  const market_repo = new MarketLocalDatabase(data);
  const product_repo = new ProductLocalDatabase(data);

  let uc = new GetSellerStatsView({
    seller_repo: seller_repo,
    market_repo: market_repo,
    product_repo: product_repo,
    revenue_callback: calculateRevenue,
  });
  const seller_stats_list = uc.execute();
  seller_stats_list.sort((a, b) => b.profit - a.profit);

  seller_stats_list.map((value, index) => {
    value.bonus = calculateBonus(index, seller_stats_list.length, value);
  });

  const representations = [];
  for (let seller_stats of seller_stats_list) {
    seller_stats.products_sold.sort((a, b) => b.quantity - a.quantity);

    const representation = {
      seller_id: seller_stats.seller.id,
      name: `${seller_stats.seller.first_name} ${seller_stats.seller.last_name}`,
      revenue: seller_stats.revenue,
      profit: seller_stats.profit,
      sales_count: seller_stats.sales_count,
      top_products: seller_stats.products_sold.slice(0, 10),
      bonus: seller_stats.bonus,
    };

    representations.push(representation);
  }

  return representations;
}
