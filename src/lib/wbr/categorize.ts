// WBR topic categorization — replaces the weekly manual Excel "auditing".
//
// Every SEMrush topic name is classified into:
//   - a VERTICAL: 'beauty' | 'fashion' | 'noise'
//   - a CATEGORY within that vertical (e.g. Lips, Skincare, Footwear)
//
// "noise" = brand/corporate/marketplace/irrelevant topics that the analyst
// strips out before counting (IPO, careers, stock, seller reg, coupons, exam
// prep, etc.). These never count toward beauty/fashion totals.
//
// The classifier is deterministic and rule-based so the SAME topic lands in the
// SAME category every week (critical for week-over-week trend tracking). Topics
// it cannot confidently place are returned as `matched: false` so they can be
// (a) reviewed quickly in the UI, or (b) sent to Claude as an optional fallback.

export type Vertical = 'beauty' | 'fashion' | 'noise';

export interface Classification {
  vertical: Vertical;
  category: string;
  matched: boolean; // false => fell through to a default bucket, needs review
}

// A rule: if any keyword/phrase matches the lowercased topic name, it's a
// candidate for `category`. `weight` breaks ties — more specific buckets win.
interface Rule {
  vertical: Vertical;
  category: string;
  weight: number;
  keywords: string[];
}

// Word-start match that tolerates common English suffixes (plurals/gerunds) so
// "blush" matches "blushes", "shampoo" matches "shampoos", "moisturizer"
// matches "moisturizers". Requires a left word boundary so "lip" does not match
// "flip" and "men" does not match "women". Multiword phrases match as substrings.
function hasKeyword(haystack: string, kw: string): boolean {
  if (kw.includes(' ')) return haystack.includes(kw);
  const re = new RegExp(`(^|[^a-z])${escapeRe(kw)}(s|es|ing|ed|er|ers)?([^a-z]|$)`);
  return re.test(haystack);
}
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---- NOISE (checked first — strips corporate/marketplace/irrelevant) --------
// Higher weight than product rules so e.g. "Nykaa IPO" never counts as beauty.
const NOISE_RULES: Rule[] = [
  {
    vertical: 'noise', category: 'Corporate / Retail Presence', weight: 100,
    keywords: [
      'ipo', 'gmp', 'allotment', 'stock', 'share price', 'shares', 'bonus',
      'split', 'financial', 'revenue', 'earnings', 'quarterly', 'results',
      'stake', 'stakes', 'nikkei', 'celebrity', 'affiliate', 'refer & earn',
      'sale', 'sales', 'pink friday', 'big billion', 'store location',
      'market cap', 'investor', 'shareholder', 'careers', 'jobs', 'job',
      'recruitment', 'hiring', 'internship', 'seller', 'registration',
      'vendor', 'customer service', 'customer care', 'policies', 'policy',
      'return policy', 'refund', 'track order', 'order tracking',
      'gift card', 'gift cards', 'rewards', 'loyalty', 'membership',
      'coupon', 'coupons', 'promo code', 'offers', 'cashback',
      'brand ambassador', 'ambassadors', 'net worth', 'founder', 'ceo',
      'acquisition', 'funding', 'valuation', 'store locator', 'stores',
      'app download', 'login', 'sign up', 'helpline', 'contact',
    ],
  },
  {
    vertical: 'noise', category: 'Marketplace / eCommerce', weight: 90,
    keywords: [
      'marketplace', 'ecommerce', 'e-commerce', 'online shopping',
      'shopping app', 'shopping sites', 'shopping website', 'best website',
      'delivery', 'shipping', 'cod', 'cash on delivery', 'payment',
      'upi', 'credit card', 'debit card', 'emi', 'wallet', 'bank',
    ],
  },
  {
    vertical: 'noise', category: 'Irrelevant / Other', weight: 80,
    keywords: [
      'exam', 'syllabus', 'admit card', 'result 2025', 'result 2026',
      'recipe', 'food', 'restaurant', 'movie', 'song', 'lyrics', 'cricket',
      'astrology', 'horoscope', 'weather', 'news today', 'politics',
      'insurance', 'loan', 'mutual fund', 'tax', 'pan card', 'aadhaar',
      'mobile phone', 'laptop', 'smartphone', 'electronics', 'gadget',
      'kindle', 'music', 'prime video', 'tv show',
      'paint', 'art supplies', 'seo', 'website ranking', 'ranking tool',
      'search engine', 'evil eye', 'nazar', 'condom', 'sexual wellness',
    ],
  },
];

// ---- BEAUTY -----------------------------------------------------------------
// Order/weight matters: a topic like "Lip Scrub" should be Lips, not Body Care.
const BEAUTY_RULES: Rule[] = [
  {
    vertical: 'beauty', category: 'Lips', weight: 60,
    keywords: [
      'lip', 'lips', 'lipstick', 'lipsticks', 'lip gloss', 'lipgloss',
      'lip liner', 'lip balm', 'lip tint', 'lip crayon', 'lip plumper',
      'lip stain', 'lip care', 'lip mask', 'lip scrub', 'liquid lipstick',
      'lip palette', 'lip oil', 'lacquer', 'lip crème', 'lip creme',
    ],
  },
  {
    vertical: 'beauty', category: 'Eye Makeup', weight: 58,
    keywords: [
      'eye', 'eyes', 'eyeliner', 'eye liner', 'kajal', 'kohl', 'mascara',
      'eyeshadow', 'eye shadow', 'eyebrow', 'eye brow', 'brow', 'eyelash',
      'eyelashes', 'lashes', 'eye primer', 'eye makeup', 'eye pencil',
      'eye palette', 'under eye', 'eye cream', 'eye gel',
    ],
  },
  {
    vertical: 'beauty', category: 'Face Makeup', weight: 55,
    keywords: [
      'foundation', 'concealer', 'color corrector', 'colour corrector',
      'compact', 'powder', 'face powder', 'loose powder', 'setting powder', 'blush',
      'blusher', 'highlighter', 'bronzer', 'contour', 'primer', 'bb cream',
      'cc cream', 'face makeup', 'makeup base', 'tinted moisturizer',
      'setting spray', 'makeup fixer', 'face tint', 'cheek tint',
    ],
  },
  {
    vertical: 'beauty', category: 'Nail', weight: 54,
    keywords: [
      'nail', 'nails', 'nail polish', 'nail paint', 'nail art', 'manicure',
      'pedicure', 'nail enamel', 'nail care', 'cuticle', 'gel nails',
      'press on nails', 'nail extensions',
    ],
  },
  {
    vertical: 'beauty', category: 'Fragrance', weight: 52,
    keywords: [
      'perfume', 'perfumes', 'fragrance', 'fragrances', 'attar', 'ittar',
      'deodorant', 'deo', 'body mist', 'body spray', 'eau de parfum',
      'eau de toilette', 'edp', 'edt', 'cologne', 'musk', 'oud', 'scent',
      'roll on', 'roll-on',
    ],
  },
  {
    vertical: 'beauty', category: 'Hair Care', weight: 50,
    keywords: [
      'hair', 'shampoo', 'conditioner', 'hair oil', 'hair serum',
      'hair mask', 'hair color', 'hair colour', 'hair dye', 'mehndi',
      'henna', 'hair cream', 'hair spray', 'hair gel', 'hair wax',
      'dandruff', 'hair fall', 'hair growth', 'scalp', 'keratin',
      'hair straightener', 'hair dryer', 'hair curler', 'hairband',
      'hair clip', 'hair accessories', 'wig', 'hair treatment',
    ],
  },
  {
    vertical: 'beauty', category: 'Body Care', weight: 46,
    keywords: [
      'body lotion', 'body wash', 'body care', 'body butter', 'body scrub',
      'body oil', 'hand cream', 'hand wash', 'foot cream', 'shower gel',
      'bath', 'soap', 'talc', 'talcum', 'moisturizing lotion',
      'intimate wash', 'wax strips', 'hair removal', 'razor', 'shaving',
      'deodorant stick',
    ],
  },
  {
    vertical: 'beauty', category: 'Skincare', weight: 44,
    keywords: [
      'skincare', 'skin care', 'skin', 'serum', 'serums', 'moisturizer',
      'moisturiser', 'sunscreen', 'spf', 'cleanser', 'face wash',
      'facewash', 'toner', 'face cream', 'night cream', 'day cream',
      'face serum', 'face mask', 'sheet mask', 'face oil', 'face gel',
      'face scrub', 'exfoliant', 'peel', 'retinol', 'niacinamide',
      'hyaluronic', 'vitamin c', 'salicylic', 'acne', 'pimple',
      'anti aging', 'anti-aging', 'anti ageing', 'dark spot', 'pigmentation',
      'face toner', 'micellar', 'cleansing', 'derma', 'dermatologist',
      'aloe vera', 'rosewater', 'rose water', 'ubtan', 'facial',
    ],
  },
  {
    vertical: 'beauty', category: 'Other Beauty', weight: 20,
    keywords: [
      'makeup', 'cosmetic', 'cosmetics', 'beauty', 'grooming', 'tool',
      'tools', 'brush', 'brushes', 'sponge', 'beauty blender', 'mirror',
      'tweezer', 'vanity', 'pouch', 'organizer', 'essential oil',
      'wellness', 'supplement', 'spa', 'salon',
    ],
  },
];

// ---- FASHION ----------------------------------------------------------------
const FASHION_RULES: Rule[] = [
  {
    vertical: 'fashion', category: 'Footwear', weight: 60,
    keywords: [
      'shoe', 'shoes', 'sneaker', 'sneakers', 'sandal', 'sandals',
      'slipper', 'slippers', 'footwear', 'heels', 'boots', 'loafers',
      'flip flop', 'flip-flop', 'crocs', 'flats', 'sports shoes', 'clogs',
    ],
  },
  {
    vertical: 'fashion', category: 'Bags', weight: 58,
    keywords: [
      'bag', 'bags', 'handbag', 'backpack', 'luggage', 'wallet', 'clutch',
      'tote', 'sling bag', 'duffel', 'trolley', 'suitcase', 'pouch bag',
    ],
  },
  {
    vertical: 'fashion', category: 'Jewellery', weight: 56,
    keywords: [
      'jewellery', 'jewelry', 'earring', 'earrings', 'necklace', 'ring',
      'bracelet', 'bangle', 'bangles', 'pendant', 'anklet', 'jhumka',
      'mangalsutra', 'nose pin', 'kundan', 'choker',
    ],
  },
  {
    vertical: 'fashion', category: 'Lingerie', weight: 54,
    keywords: [
      'lingerie', 'bra', 'bras', 'innerwear', 'underwear', 'undergarment',
      'panties', 'briefs', 'camisole', 'shapewear', 'nightwear', 'sleepwear',
      'nighty', 'boxers', 'vest',
    ],
  },
  {
    vertical: 'fashion', category: 'Indian Wear', weight: 50,
    keywords: [
      'saree', 'sari', 'lehenga', 'kurta', 'kurti', 'salwar', 'kameez',
      'ethnic', 'indian wear', 'blouse', 'dupatta', 'sherwani', 'anarkali',
      'palazzo', 'churidar', 'dhoti', 'nehru jacket', 'designer wear',
    ],
  },
  {
    vertical: 'fashion', category: 'Western Wear', weight: 48,
    keywords: [
      'dress', 'dresses', 'jeans', 'denim', 'top', 'tops', 'skirt',
      'trousers', 'pants', 'shorts', 'jumpsuit', 'gown', 'blazer',
      'sweater', 'sweatshirt', 'hoodie', 'co-ord', 'co ord', 'swimwear',
      'western wear', 'leggings', 'jeggings',
    ],
  },
  {
    vertical: 'fashion', category: 'Men Fashion', weight: 46,
    keywords: [
      "men's", 'mens', 'men ', 'shirt', 'shirts', 't-shirt', 't shirt',
      'tshirt', 'jacket', 'jackets', 'formal wear', 'suit', 'trackpant',
      'track pant', 'innerwear men', 'menswear',
    ],
  },
  {
    vertical: 'fashion', category: 'Accessories', weight: 30,
    keywords: [
      'belt', 'belts', 'watch', 'watches', 'sunglasses', 'cap', 'hat',
      'scarf', 'stole', 'tie', 'socks', 'gloves', 'accessories',
      'wallet men', 'muffler',
    ],
  },
  {
    vertical: 'fashion', category: 'Other Fashion', weight: 15,
    keywords: ['fashion', 'apparel', 'clothing', 'wear', 'outfit', 'style'],
  },
];

const ALL_RULES = [...NOISE_RULES, ...BEAUTY_RULES, ...FASHION_RULES];

export interface ClassifyOptions {
  // Which vertical this report is about. Topics that land in the OTHER product
  // vertical are treated as noise for totals (e.g. a saree in a Beauty report).
  vertical: 'beauty' | 'fashion';
}

export function classifyTopic(name: string, opts: ClassifyOptions): Classification {
  const h = ` ${name.toLowerCase().trim()} `;

  let best: Rule | null = null;
  let bestHits = 0;
  for (const rule of ALL_RULES) {
    let hits = 0;
    for (const kw of rule.keywords) if (hasKeyword(h, kw)) hits++;
    if (hits === 0) continue;
    // Prefer higher weight; break ties by number of keyword hits.
    if (
      best === null ||
      rule.weight > best.weight ||
      (rule.weight === best.weight && hits > bestHits)
    ) {
      best = rule;
      bestHits = hits;
    }
  }

  if (!best) {
    return { vertical: 'noise', category: 'Irrelevant / Other', matched: false };
  }

  // Cross-vertical product topics count as noise for THIS report's totals,
  // but we keep the real category label so the UI can show what it was.
  if (best.vertical !== 'noise' && best.vertical !== opts.vertical) {
    return { vertical: 'noise', category: `${best.category} (other vertical)`, matched: true };
  }

  // "Other Beauty/Fashion" is a low-confidence catch-all — flag for review.
  const matched = best.weight > 19;
  return { vertical: best.vertical, category: best.category, matched };
}

// Ordered category lists for stable report row ordering.
export const BEAUTY_CATEGORIES = [
  'Skincare', 'Lips', 'Hair Care', 'Fragrance', 'Eye Makeup',
  'Face Makeup', 'Body Care', 'Nail', 'Other Beauty',
];
export const FASHION_CATEGORIES = [
  'Indian Wear', 'Western Wear', 'Men Fashion', 'Bags', 'Lingerie',
  'Footwear', 'Jewellery', 'Accessories', 'Other Fashion',
];
