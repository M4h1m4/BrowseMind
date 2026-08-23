// StockWise Global Data Store
const STOCKWISE = {
  products: [
    {
      id: "PRD001", sku: "ELEC-MON-001", name: "27-inch 4K Monitor", category: "Electronics",
      description: "Ultra HD 4K display with IPS panel, 60Hz refresh rate, HDMI and DisplayPort inputs. Ideal for design and development workstations.",
      unitPrice: 349.99, stockLevel: 8, reorderPoint: 15, supplierId: "SUP001",
      unit: "each", lastUpdated: "2026-08-10"
    },
    {
      id: "PRD002", sku: "ELEC-KEY-002", name: "Mechanical Keyboard", category: "Electronics",
      description: "Full-size mechanical keyboard with Cherry MX Blue switches, backlit keys, and USB-C connectivity.",
      unitPrice: 89.99, stockLevel: 22, reorderPoint: 20, supplierId: "SUP001",
      unit: "each", lastUpdated: "2026-08-12"
    },
    {
      id: "PRD003", sku: "ELEC-MSE-003", name: "Wireless Mouse", category: "Electronics",
      description: "Ergonomic wireless mouse with 2.4GHz connectivity, 1600 DPI sensor, and 12-month battery life.",
      unitPrice: 34.99, stockLevel: 5, reorderPoint: 25, supplierId: "SUP001",
      unit: "each", lastUpdated: "2026-08-08"
    },
    {
      id: "PRD004", sku: "ELEC-HUB-004", name: "USB-C Hub 7-Port", category: "Electronics",
      description: "7-in-1 USB-C hub with HDMI, 3x USB-A, SD card, microSD, and 100W PD pass-through.",
      unitPrice: 49.99, stockLevel: 31, reorderPoint: 20, supplierId: "SUP002",
      unit: "each", lastUpdated: "2026-08-14"
    },
    {
      id: "PRD005", sku: "ELEC-WBM-005", name: "HD Webcam 1080p", category: "Electronics",
      description: "Full HD 1080p webcam with built-in dual microphone, auto-focus, and wide-angle lens. Plug-and-play USB.",
      unitPrice: 64.99, stockLevel: 18, reorderPoint: 15, supplierId: "SUP002",
      unit: "each", lastUpdated: "2026-08-11"
    },
    {
      id: "PRD006", sku: "OFFC-PPR-006", name: "Copy Paper A4 (Ream)", category: "Office Supplies",
      description: "80gsm A4 copy paper, 500 sheets per ream. Suitable for laser and inkjet printers.",
      unitPrice: 6.49, stockLevel: 4, reorderPoint: 50, supplierId: "SUP003",
      unit: "box", lastUpdated: "2026-08-05"
    },
    {
      id: "PRD007", sku: "OFFC-PEN-007", name: "Ballpoint Pens (Box of 50)", category: "Office Supplies",
      description: "Medium-point blue ballpoint pens, smooth ink flow, retractable clip design. Box of 50.",
      unitPrice: 12.99, stockLevel: 28, reorderPoint: 20, supplierId: "SUP003",
      unit: "box", lastUpdated: "2026-08-13"
    },
    {
      id: "PRD008", sku: "OFFC-STK-008", name: "Sticky Notes (Pack of 12)", category: "Office Supplies",
      description: "3x3 inch sticky notes in assorted colors, 100 sheets per pad, 12 pads per pack.",
      unitPrice: 8.99, stockLevel: 45, reorderPoint: 30, supplierId: "SUP003",
      unit: "box", lastUpdated: "2026-08-09"
    },
    {
      id: "PRD009", sku: "OFFC-FLD-009", name: "Hanging File Folders (Box)", category: "Office Supplies",
      description: "Standard letter-size hanging file folders, 25 per box, with plastic tabs and labels included.",
      unitPrice: 15.99, stockLevel: 3, reorderPoint: 20, supplierId: "SUP004",
      unit: "box", lastUpdated: "2026-08-07"
    },
    {
      id: "PRD010", sku: "OFFC-STP-010", name: "Stapler Heavy Duty", category: "Office Supplies",
      description: "Heavy-duty stapler, capacity up to 50 sheets, uses standard 26/6 staples. Chrome and black finish.",
      unitPrice: 22.99, stockLevel: 14, reorderPoint: 10, supplierId: "SUP004",
      unit: "each", lastUpdated: "2026-08-10"
    },
    {
      id: "PRD011", sku: "FURN-DSK-011", name: "Standing Desk Converter", category: "Furniture",
      description: "Height-adjustable sit-stand desk converter, 36-inch wide surface, gas spring mechanism, monitor shelf included.",
      unitPrice: 249.99, stockLevel: 6, reorderPoint: 5, supplierId: "SUP005",
      unit: "each", lastUpdated: "2026-08-01"
    },
    {
      id: "PRD012", sku: "FURN-CHR-012", name: "Ergonomic Office Chair", category: "Furniture",
      description: "Fully adjustable ergonomic chair with lumbar support, armrests, headrest, and breathable mesh back. Supports up to 300 lbs.",
      unitPrice: 449.99, stockLevel: 4, reorderPoint: 8, supplierId: "SUP005",
      unit: "each", lastUpdated: "2026-08-03"
    },
    {
      id: "PRD013", sku: "FURN-CBN-013", name: "Filing Cabinet 4-Drawer", category: "Furniture",
      description: "Lateral 4-drawer filing cabinet, letter and legal size, with lock and anti-tilt mechanism. Color: charcoal.",
      unitPrice: 319.99, stockLevel: 9, reorderPoint: 5, supplierId: "SUP005",
      unit: "each", lastUpdated: "2026-08-06"
    },
    {
      id: "PRD014", sku: "FURN-SHF-014", name: "Bookshelf 5-Tier", category: "Furniture",
      description: "Freestanding 5-tier bookshelf, 71 inches tall, engineered wood construction, adjustable shelves.",
      unitPrice: 129.99, stockLevel: 12, reorderPoint: 8, supplierId: "SUP006",
      unit: "each", lastUpdated: "2026-08-08"
    },
    {
      id: "PRD015", sku: "TOOL-DRL-015", name: "Cordless Drill Set", category: "Tools",
      description: "20V lithium-ion cordless drill with 2 batteries, charger, and 30-piece accessory kit. Variable speed, LED light.",
      unitPrice: 89.99, stockLevel: 11, reorderPoint: 10, supplierId: "SUP007",
      unit: "each", lastUpdated: "2026-08-10"
    },
    {
      id: "PRD016", sku: "TOOL-WRN-016", name: "Socket Wrench Set", category: "Tools",
      description: "72-piece 1/4 and 3/8 inch drive socket set with ratchet handles, extensions, and carrying case.",
      unitPrice: 54.99, stockLevel: 7, reorderPoint: 8, supplierId: "SUP007",
      unit: "each", lastUpdated: "2026-08-09"
    },
    {
      id: "PRD017", sku: "TOOL-LDR-017", name: "Aluminum Step Ladder 6ft", category: "Tools",
      description: "6-foot aluminum step ladder with non-slip steps, safety locks, and 250 lb weight capacity. ANSI Type II rated.",
      unitPrice: 74.99, stockLevel: 5, reorderPoint: 4, supplierId: "SUP008",
      unit: "each", lastUpdated: "2026-08-07"
    },
    {
      id: "PRD018", sku: "TOOL-TBX-018", name: "Tool Box Large", category: "Tools",
      description: "Large metal tool box, 26 inches wide, 5 drawers with ball-bearing slides, keyed lock, powder-coated steel.",
      unitPrice: 164.99, stockLevel: 3, reorderPoint: 5, supplierId: "SUP008",
      unit: "each", lastUpdated: "2026-08-04"
    },
    {
      id: "PRD019", sku: "CONS-CLN-019", name: "All-Purpose Cleaner (5L)", category: "Consumables",
      description: "Industrial all-purpose cleaning concentrate, 5-liter jug. Dilutes up to 1:20. Biodegradable formula.",
      unitPrice: 18.99, stockLevel: 36, reorderPoint: 25, supplierId: "SUP009",
      unit: "liter", lastUpdated: "2026-08-12"
    },
    {
      id: "PRD020", sku: "CONS-PPR-020", name: "Paper Towel Rolls (Case)", category: "Consumables",
      description: "Industrial 2-ply paper towel rolls, 80 sheets per roll, 30 rolls per case. High absorbency.",
      unitPrice: 42.99, stockLevel: 18, reorderPoint: 15, supplierId: "SUP009",
      unit: "box", lastUpdated: "2026-08-11"
    },
    {
      id: "PRD021", sku: "CONS-GLV-021", name: "Nitrile Gloves (Box 100)", category: "Consumables",
      description: "Powder-free nitrile examination gloves, medium size, 100 per box. Latex-free, chemical resistant.",
      unitPrice: 11.99, stockLevel: 55, reorderPoint: 40, supplierId: "SUP010",
      unit: "box", lastUpdated: "2026-08-13"
    },
    {
      id: "PRD022", sku: "CONS-MSK-022", name: "N95 Respirator Masks (Box)", category: "Consumables",
      description: "NIOSH-approved N95 respirator masks, 20 per box. Adjustable nose bridge, dual straps, fluid resistant.",
      unitPrice: 29.99, stockLevel: 2, reorderPoint: 30, supplierId: "SUP010",
      unit: "box", lastUpdated: "2026-08-06"
    },
    {
      id: "PRD023", sku: "ELEC-CAB-023", name: "Cat6 Ethernet Cable (50ft)", category: "Electronics",
      description: "50-foot Cat6 UTP ethernet cable, snagless RJ45 connectors, 550MHz bandwidth. Color: blue.",
      unitPrice: 14.99, stockLevel: 42, reorderPoint: 30, supplierId: "SUP002",
      unit: "each", lastUpdated: "2026-08-14"
    },
    {
      id: "PRD024", sku: "OFFC-INK-024", name: "Inkjet Cartridge Set (4-color)", category: "Office Supplies",
      description: "Compatible 4-color inkjet cartridge set (CMYK) for HP OfficeJet Pro series. High-yield, up to 500 pages per cartridge.",
      unitPrice: 39.99, stockLevel: 9, reorderPoint: 15, supplierId: "SUP004",
      unit: "each", lastUpdated: "2026-08-09"
    },
    {
      id: "PRD025", sku: "CONS-SAN-025", name: "Hand Sanitizer (1L Pump)", category: "Consumables",
      description: "70% isopropyl alcohol hand sanitizer, 1-liter pump dispenser. WHO-formula, kills 99.9% of germs.",
      unitPrice: 8.99, stockLevel: 24, reorderPoint: 20, supplierId: "SUP010",
      unit: "liter", lastUpdated: "2026-08-13"
    }
  ],

  suppliers: [
    {
      id: "SUP001", name: "TechSource Direct", contactPerson: "Amanda Reyes",
      email: "a.reyes@techsourcedirect.com", phone: "555-210-4400",
      address: "1402 Silicon Way, San Jose, CA 95110",
      paymentTerms: "Net30", rating: 5
    },
    {
      id: "SUP002", name: "Pacific Electronics Wholesale", contactPerson: "Derek Huang",
      email: "derek.huang@pacificew.com", phone: "555-318-7700",
      address: "890 Harbor Blvd, Oakland, CA 94607",
      paymentTerms: "Net30", rating: 4
    },
    {
      id: "SUP003", name: "Office Pro Supplies Co.", contactPerson: "Sandra Nweke",
      email: "s.nweke@officeprosupplies.com", phone: "555-442-0099",
      address: "233 Commerce Park, Chicago, IL 60601",
      paymentTerms: "Net15", rating: 4
    },
    {
      id: "SUP004", name: "Central Stationery Hub", contactPerson: "Tom Eriksson",
      email: "t.eriksson@centralstationery.com", phone: "555-871-2210",
      address: "50 Market Street, Philadelphia, PA 19103",
      paymentTerms: "Net30", rating: 3
    },
    {
      id: "SUP005", name: "Premier Office Furniture", contactPerson: "Lisa Monroe",
      email: "l.monroe@premierfurniture.biz", phone: "555-660-3380",
      address: "7820 Industrial Ave, Dallas, TX 75201",
      paymentTerms: "Net60", rating: 5
    },
    {
      id: "SUP006", name: "Workspace Solutions Ltd.", contactPerson: "Gerald Bauer",
      email: "g.bauer@workspacesol.com", phone: "555-993-1145",
      address: "412 Office Park Dr, Atlanta, GA 30301",
      paymentTerms: "Net30", rating: 4
    },
    {
      id: "SUP007", name: "Industrial Tools Supply", contactPerson: "Carlos Mendez",
      email: "c.mendez@industrtools.com", phone: "555-520-8870",
      address: "3301 Factory Rd, Detroit, MI 48201",
      paymentTerms: "Net30", rating: 4
    },
    {
      id: "SUP008", name: "National Hardware Depot", contactPerson: "Patricia Osei",
      email: "p.osei@nathardware.com", phone: "555-774-4420",
      address: "1120 Trade Blvd, Cleveland, OH 44101",
      paymentTerms: "Net15", rating: 3
    },
    {
      id: "SUP009", name: "CleanMart Distribution", contactPerson: "Frank Zhao",
      email: "f.zhao@cleanmartdist.com", phone: "555-338-9910",
      address: "670 Logistics Way, Memphis, TN 38103",
      paymentTerms: "Net30", rating: 4
    },
    {
      id: "SUP010", name: "SafeGuard PPE Suppliers", contactPerson: "Rachel Singh",
      email: "r.singh@safeguardppe.com", phone: "555-115-6630",
      address: "2244 Safety Blvd, Houston, TX 77001",
      paymentTerms: "Net30", rating: 5
    },
    {
      id: "SUP011", name: "BulkBuy Distributors", contactPerson: "Hector Villanueva",
      email: "h.villanueva@bulkbuydist.com", phone: "555-882-3300",
      address: "9900 Distribution Center Pkwy, Columbus, OH 43215",
      paymentTerms: "Net60", rating: 3
    },
    {
      id: "SUP012", name: "Greenfield Office Group", contactPerson: "Nadia Kowalski",
      email: "n.kowalski@greenfieldoffice.com", phone: "555-447-7712",
      address: "55 Corporate Drive, Boston, MA 02101",
      paymentTerms: "Net30", rating: 4
    }
  ],

  purchaseOrders: [
    {
      id: "PO-2026-001", supplierId: "SUP001", status: "received",
      orderDate: "2026-07-01", expectedDelivery: "2026-07-15",
      items: [
        { productId: "PRD001", qty: 10, unitPrice: 349.99 },
        { productId: "PRD002", qty: 15, unitPrice: 89.99 }
      ],
      totalAmount: 4849.75, notes: "Quarterly electronics restock. Confirm shipping via FedEx."
    },
    {
      id: "PO-2026-002", supplierId: "SUP003", status: "received",
      orderDate: "2026-07-03", expectedDelivery: "2026-07-10",
      items: [
        { productId: "PRD006", qty: 100, unitPrice: 6.49 },
        { productId: "PRD007", qty: 20, unitPrice: 12.99 }
      ],
      totalAmount: 908.80, notes: "Monthly office supplies replenishment."
    },
    {
      id: "PO-2026-003", supplierId: "SUP005", status: "received",
      orderDate: "2026-07-05", expectedDelivery: "2026-07-25",
      items: [
        { productId: "PRD012", qty: 5, unitPrice: 449.99 },
        { productId: "PRD011", qty: 3, unitPrice: 249.99 }
      ],
      totalAmount: 2999.92, notes: "New office setup - furniture order."
    },
    {
      id: "PO-2026-004", supplierId: "SUP010", status: "received",
      orderDate: "2026-07-08", expectedDelivery: "2026-07-18",
      items: [
        { productId: "PRD021", qty: 50, unitPrice: 11.99 },
        { productId: "PRD022", qty: 30, unitPrice: 29.99 },
        { productId: "PRD025", qty: 20, unitPrice: 8.99 }
      ],
      totalAmount: 1676.30, notes: "Safety supplies restocking - urgent."
    },
    {
      id: "PO-2026-005", supplierId: "SUP007", status: "received",
      orderDate: "2026-07-10", expectedDelivery: "2026-07-22",
      items: [
        { productId: "PRD015", qty: 8, unitPrice: 89.99 },
        { productId: "PRD016", qty: 6, unitPrice: 54.99 }
      ],
      totalAmount: 1049.86, notes: "Workshop tools replenishment."
    },
    {
      id: "PO-2026-006", supplierId: "SUP002", status: "approved",
      orderDate: "2026-07-15", expectedDelivery: "2026-07-30",
      items: [
        { productId: "PRD004", qty: 20, unitPrice: 49.99 },
        { productId: "PRD023", qty: 30, unitPrice: 14.99 }
      ],
      totalAmount: 1449.50, notes: "Network accessories order."
    },
    {
      id: "PO-2026-007", supplierId: "SUP001", status: "submitted",
      orderDate: "2026-07-18", expectedDelivery: "2026-08-05",
      items: [
        { productId: "PRD003", qty: 25, unitPrice: 34.99 },
        { productId: "PRD005", qty: 10, unitPrice: 64.99 }
      ],
      totalAmount: 1524.65, notes: "Peripheral devices reorder - low stock situation."
    },
    {
      id: "PO-2026-008", supplierId: "SUP004", status: "submitted",
      orderDate: "2026-07-20", expectedDelivery: "2026-08-03",
      items: [
        { productId: "PRD009", qty: 25, unitPrice: 15.99 },
        { productId: "PRD024", qty: 20, unitPrice: 39.99 }
      ],
      totalAmount: 1199.55, notes: "Filing supplies and ink cartridges."
    },
    {
      id: "PO-2026-009", supplierId: "SUP009", status: "approved",
      orderDate: "2026-07-22", expectedDelivery: "2026-08-06",
      items: [
        { productId: "PRD019", qty: 15, unitPrice: 18.99 },
        { productId: "PRD020", qty: 10, unitPrice: 42.99 }
      ],
      totalAmount: 714.75, notes: "Cleaning supplies restocking."
    },
    {
      id: "PO-2026-010", supplierId: "SUP008", status: "draft",
      orderDate: "2026-07-25", expectedDelivery: "2026-08-10",
      items: [
        { productId: "PRD017", qty: 5, unitPrice: 74.99 },
        { productId: "PRD018", qty: 4, unitPrice: 164.99 }
      ],
      totalAmount: 1034.91, notes: "Maintenance equipment - pending budget approval."
    },
    {
      id: "PO-2026-011", supplierId: "SUP003", status: "received",
      orderDate: "2026-07-28", expectedDelivery: "2026-08-05",
      items: [
        { productId: "PRD006", qty: 80, unitPrice: 6.49 },
        { productId: "PRD008", qty: 10, unitPrice: 8.99 }
      ],
      totalAmount: 608.10, notes: "Paper and stationery reorder."
    },
    {
      id: "PO-2026-012", supplierId: "SUP005", status: "approved",
      orderDate: "2026-07-30", expectedDelivery: "2026-08-20",
      items: [
        { productId: "PRD012", qty: 6, unitPrice: 449.99 },
        { productId: "PRD013", qty: 4, unitPrice: 319.99 }
      ],
      totalAmount: 3979.90, notes: "Expansion office furniture - Building B."
    },
    {
      id: "PO-2026-013", supplierId: "SUP001", status: "draft",
      orderDate: "2026-08-01", expectedDelivery: "2026-08-18",
      items: [
        { productId: "PRD001", qty: 20, unitPrice: 349.99 },
        { productId: "PRD003", qty: 30, unitPrice: 34.99 }
      ],
      totalAmount: 8048.50, notes: "Urgent restock for monitors and mice."
    },
    {
      id: "PO-2026-014", supplierId: "SUP010", status: "submitted",
      orderDate: "2026-08-02", expectedDelivery: "2026-08-14",
      items: [
        { productId: "PRD022", qty: 50, unitPrice: 29.99 },
        { productId: "PRD025", qty: 30, unitPrice: 8.99 }
      ],
      totalAmount: 1766.70, notes: "PPE critical restock."
    },
    {
      id: "PO-2026-015", supplierId: "SUP006", status: "received",
      orderDate: "2026-08-03", expectedDelivery: "2026-08-14",
      items: [
        { productId: "PRD014", qty: 8, unitPrice: 129.99 }
      ],
      totalAmount: 1039.92, notes: "Bookshelves for new library room."
    },
    {
      id: "PO-2026-016", supplierId: "SUP002", status: "cancelled",
      orderDate: "2026-08-04", expectedDelivery: "2026-08-20",
      items: [
        { productId: "PRD004", qty: 15, unitPrice: 49.99 },
        { productId: "PRD005", qty: 12, unitPrice: 64.99 }
      ],
      totalAmount: 1529.73, notes: "Cancelled - duplicate order. See PO-2026-006."
    },
    {
      id: "PO-2026-017", supplierId: "SUP007", status: "approved",
      orderDate: "2026-08-05", expectedDelivery: "2026-08-22",
      items: [
        { productId: "PRD016", qty: 10, unitPrice: 54.99 },
        { productId: "PRD015", qty: 5, unitPrice: 89.99 }
      ],
      totalAmount: 999.85, notes: "Tool replacement for maintenance team."
    },
    {
      id: "PO-2026-018", supplierId: "SUP004", status: "cancelled",
      orderDate: "2026-08-06", expectedDelivery: "2026-08-16",
      items: [
        { productId: "PRD010", qty: 10, unitPrice: 22.99 }
      ],
      totalAmount: 229.90, notes: "Cancelled - found surplus in storage."
    },
    {
      id: "PO-2026-019", supplierId: "SUP009", status: "submitted",
      orderDate: "2026-08-07", expectedDelivery: "2026-08-20",
      items: [
        { productId: "PRD019", qty: 20, unitPrice: 18.99 },
        { productId: "PRD020", qty: 15, unitPrice: 42.99 }
      ],
      totalAmount: 1022.65, notes: "Building maintenance supplies."
    },
    {
      id: "PO-2026-020", supplierId: "SUP003", status: "draft",
      orderDate: "2026-08-10", expectedDelivery: "2026-08-22",
      items: [
        { productId: "PRD006", qty: 120, unitPrice: 6.49 },
        { productId: "PRD007", qty: 15, unitPrice: 12.99 }
      ],
      totalAmount: 972.65, notes: "Large paper order for Q3 print jobs."
    },
    {
      id: "PO-2026-021", supplierId: "SUP011", status: "submitted",
      orderDate: "2026-08-12", expectedDelivery: "2026-08-28",
      items: [
        { productId: "PRD008", qty: 25, unitPrice: 8.99 },
        { productId: "PRD007", qty: 10, unitPrice: 12.99 }
      ],
      totalAmount: 354.65, notes: "Stationery bulk purchase Q3."
    },
    {
      id: "PO-2026-022", supplierId: "SUP012", status: "draft",
      orderDate: "2026-08-15", expectedDelivery: "2026-09-01",
      items: [
        { productId: "PRD011", qty: 4, unitPrice: 249.99 },
        { productId: "PRD014", qty: 6, unitPrice: 129.99 }
      ],
      totalAmount: 1779.90, notes: "Furniture for remote worker home office stipend program."
    }
  ],

  stockMovements: {
    "PRD001": [
      { date: "2026-06-15", type: "purchase", qty: 20, balance: 20, reference: "PO-2026-001" },
      { date: "2026-06-20", type: "sale", qty: -5, balance: 15, reference: "SO-2026-041" },
      { date: "2026-07-01", type: "purchase", qty: 10, balance: 25, reference: "PO-2026-001" },
      { date: "2026-07-14", type: "sale", qty: -8, balance: 17, reference: "SO-2026-058" },
      { date: "2026-08-10", type: "sale", qty: -9, balance: 8, reference: "SO-2026-082" }
    ],
    "PRD002": [
      { date: "2026-06-10", type: "purchase", qty: 30, balance: 30, reference: "PO-2026-001" },
      { date: "2026-06-25", type: "sale", qty: -5, balance: 25, reference: "SO-2026-044" },
      { date: "2026-07-01", type: "purchase", qty: 15, balance: 40, reference: "PO-2026-001" },
      { date: "2026-07-20", type: "sale", qty: -12, balance: 28, reference: "SO-2026-062" },
      { date: "2026-08-12", type: "adjustment", qty: -6, balance: 22, reference: "ADJ-2026-009" }
    ],
    "PRD003": [
      { date: "2026-06-05", type: "purchase", qty: 40, balance: 40, reference: "PO-2026-007" },
      { date: "2026-06-18", type: "sale", qty: -10, balance: 30, reference: "SO-2026-039" },
      { date: "2026-07-05", type: "sale", qty: -8, balance: 22, reference: "SO-2026-055" },
      { date: "2026-07-22", type: "sale", qty: -7, balance: 15, reference: "SO-2026-067" },
      { date: "2026-08-08", type: "sale", qty: -10, balance: 5, reference: "SO-2026-079" }
    ],
    "PRD004": [
      { date: "2026-06-12", type: "purchase", qty: 20, balance: 20, reference: "PO-2026-006" },
      { date: "2026-06-30", type: "sale", qty: -4, balance: 16, reference: "SO-2026-048" },
      { date: "2026-07-15", type: "purchase", qty: 20, balance: 36, reference: "PO-2026-006" },
      { date: "2026-08-01", type: "sale", qty: -3, balance: 33, reference: "SO-2026-073" },
      { date: "2026-08-14", type: "adjustment", qty: -2, balance: 31, reference: "ADJ-2026-012" }
    ],
    "PRD005": [
      { date: "2026-06-14", type: "purchase", qty: 10, balance: 10, reference: "PO-2026-007" },
      { date: "2026-07-01", type: "purchase", qty: 10, balance: 20, reference: "PO-2026-007" },
      { date: "2026-07-18", type: "sale", qty: -5, balance: 15, reference: "SO-2026-061" },
      { date: "2026-08-05", type: "sale", qty: -4, balance: 11, reference: "SO-2026-077" },
      { date: "2026-08-11", type: "adjustment", qty: 7, balance: 18, reference: "ADJ-2026-014" }
    ],
    "PRD006": [
      { date: "2026-06-01", type: "purchase", qty: 200, balance: 200, reference: "PO-2026-002" },
      { date: "2026-06-15", type: "sale", qty: -60, balance: 140, reference: "SO-2026-037" },
      { date: "2026-07-01", type: "sale", qty: -50, balance: 90, reference: "SO-2026-052" },
      { date: "2026-07-28", type: "purchase", qty: 80, balance: 170, reference: "PO-2026-011" },
      { date: "2026-08-05", type: "sale", qty: -166, balance: 4, reference: "SO-2026-080" }
    ],
    "PRD007": [
      { date: "2026-06-03", type: "purchase", qty: 20, balance: 20, reference: "PO-2026-002" },
      { date: "2026-06-20", type: "sale", qty: -5, balance: 15, reference: "SO-2026-041" },
      { date: "2026-07-10", type: "purchase", qty: 20, balance: 35, reference: "PO-2026-020" },
      { date: "2026-08-01", type: "sale", qty: -4, balance: 31, reference: "SO-2026-073" },
      { date: "2026-08-13", type: "adjustment", qty: 1, balance: 28, reference: "ADJ-2026-015" }
    ],
    "PRD008": [
      { date: "2026-06-10", type: "purchase", qty: 30, balance: 30, reference: "PO-2026-011" },
      { date: "2026-06-25", type: "sale", qty: -5, balance: 25, reference: "SO-2026-045" },
      { date: "2026-07-12", type: "purchase", qty: 10, balance: 35, reference: "PO-2026-011" },
      { date: "2026-07-28", type: "sale", qty: -2, balance: 33, reference: "SO-2026-069" },
      { date: "2026-08-09", type: "adjustment", qty: 12, balance: 45, reference: "ADJ-2026-011" }
    ],
    "PRD009": [
      { date: "2026-06-08", type: "purchase", qty: 30, balance: 30, reference: "PO-2026-008" },
      { date: "2026-06-22", type: "sale", qty: -10, balance: 20, reference: "SO-2026-043" },
      { date: "2026-07-05", type: "sale", qty: -5, balance: 15, reference: "SO-2026-054" },
      { date: "2026-07-19", type: "sale", qty: -6, balance: 9, reference: "SO-2026-063" },
      { date: "2026-08-07", type: "sale", qty: -6, balance: 3, reference: "SO-2026-078" }
    ],
    "PRD010": [
      { date: "2026-06-12", type: "purchase", qty: 15, balance: 15, reference: "PO-2026-018" },
      { date: "2026-06-28", type: "sale", qty: -3, balance: 12, reference: "SO-2026-047" },
      { date: "2026-07-15", type: "adjustment", qty: 2, balance: 14, reference: "ADJ-2026-007" },
      { date: "2026-08-02", type: "sale", qty: -2, balance: 12, reference: "SO-2026-074" },
      { date: "2026-08-10", type: "sale", qty: 2, balance: 14, reference: "RTN-2026-003" }
    ],
    "PRD011": [
      { date: "2026-06-20", type: "purchase", qty: 5, balance: 5, reference: "PO-2026-003" },
      { date: "2026-07-05", type: "sale", qty: -2, balance: 3, reference: "SO-2026-053" },
      { date: "2026-07-20", type: "purchase", qty: 3, balance: 6, reference: "PO-2026-003" },
      { date: "2026-08-01", type: "sale", qty: -1, balance: 5, reference: "SO-2026-072" },
      { date: "2026-08-08", type: "adjustment", qty: 1, balance: 6, reference: "ADJ-2026-010" }
    ],
    "PRD012": [
      { date: "2026-06-15", type: "purchase", qty: 5, balance: 5, reference: "PO-2026-003" },
      { date: "2026-06-28", type: "sale", qty: -2, balance: 3, reference: "SO-2026-047" },
      { date: "2026-07-05", type: "purchase", qty: 5, balance: 8, reference: "PO-2026-003" },
      { date: "2026-07-25", type: "sale", qty: -3, balance: 5, reference: "SO-2026-068" },
      { date: "2026-08-03", type: "sale", qty: -1, balance: 4, reference: "SO-2026-075" }
    ],
    "PRD013": [
      { date: "2026-06-18", type: "purchase", qty: 8, balance: 8, reference: "PO-2026-012" },
      { date: "2026-07-02", type: "sale", qty: -2, balance: 6, reference: "SO-2026-051" },
      { date: "2026-07-16", type: "adjustment", qty: -1, balance: 5, reference: "ADJ-2026-008" },
      { date: "2026-07-30", type: "purchase", qty: 6, balance: 11, reference: "PO-2026-012" },
      { date: "2026-08-06", type: "sale", qty: -2, balance: 9, reference: "SO-2026-077" }
    ],
    "PRD014": [
      { date: "2026-07-01", type: "purchase", qty: 8, balance: 8, reference: "PO-2026-015" },
      { date: "2026-07-12", type: "sale", qty: -2, balance: 6, reference: "SO-2026-057" },
      { date: "2026-07-28", type: "adjustment", qty: 2, balance: 8, reference: "ADJ-2026-009" },
      { date: "2026-08-03", type: "purchase", qty: 8, balance: 16, reference: "PO-2026-015" },
      { date: "2026-08-08", type: "sale", qty: -4, balance: 12, reference: "SO-2026-079" }
    ],
    "PRD015": [
      { date: "2026-06-22", type: "purchase", qty: 8, balance: 8, reference: "PO-2026-005" },
      { date: "2026-07-05", type: "sale", qty: -2, balance: 6, reference: "SO-2026-054" },
      { date: "2026-07-22", type: "purchase", qty: 8, balance: 14, reference: "PO-2026-005" },
      { date: "2026-08-05", type: "sale", qty: -3, balance: 11, reference: "SO-2026-077" },
      { date: "2026-08-10", type: "adjustment", qty: 0, balance: 11, reference: "ADJ-2026-013" }
    ],
    "PRD016": [
      { date: "2026-06-25", type: "purchase", qty: 6, balance: 6, reference: "PO-2026-005" },
      { date: "2026-07-08", type: "sale", qty: -2, balance: 4, reference: "SO-2026-056" },
      { date: "2026-07-22", type: "purchase", qty: 6, balance: 10, reference: "PO-2026-005" },
      { date: "2026-08-03", type: "sale", qty: -2, balance: 8, reference: "SO-2026-075" },
      { date: "2026-08-09", type: "sale", qty: -1, balance: 7, reference: "SO-2026-081" }
    ],
    "PRD017": [
      { date: "2026-06-28", type: "purchase", qty: 5, balance: 5, reference: "PO-2026-010" },
      { date: "2026-07-10", type: "sale", qty: -1, balance: 4, reference: "SO-2026-057" },
      { date: "2026-07-20", type: "purchase", qty: 5, balance: 9, reference: "PO-2026-010" },
      { date: "2026-08-01", type: "sale", qty: -2, balance: 7, reference: "SO-2026-072" },
      { date: "2026-08-07", type: "sale", qty: -2, balance: 5, reference: "SO-2026-078" }
    ],
    "PRD018": [
      { date: "2026-07-02", type: "purchase", qty: 4, balance: 4, reference: "PO-2026-010" },
      { date: "2026-07-15", type: "sale", qty: -1, balance: 3, reference: "SO-2026-060" },
      { date: "2026-07-28", type: "adjustment", qty: -1, balance: 2, reference: "ADJ-2026-008" },
      { date: "2026-08-04", type: "purchase", qty: 4, balance: 6, reference: "PO-2026-010" },
      { date: "2026-08-07", type: "sale", qty: -3, balance: 3, reference: "SO-2026-078" }
    ],
    "PRD019": [
      { date: "2026-06-05", type: "purchase", qty: 15, balance: 15, reference: "PO-2026-009" },
      { date: "2026-06-20", type: "sale", qty: -4, balance: 11, reference: "SO-2026-042" },
      { date: "2026-07-08", type: "purchase", qty: 15, balance: 26, reference: "PO-2026-009" },
      { date: "2026-07-22", type: "sale", qty: -5, balance: 21, reference: "SO-2026-066" },
      { date: "2026-08-12", type: "return", qty: 15, balance: 36, reference: "RTN-2026-004" }
    ],
    "PRD020": [
      { date: "2026-06-08", type: "purchase", qty: 10, balance: 10, reference: "PO-2026-009" },
      { date: "2026-06-22", type: "sale", qty: -3, balance: 7, reference: "SO-2026-043" },
      { date: "2026-07-10", type: "purchase", qty: 10, balance: 17, reference: "PO-2026-009" },
      { date: "2026-07-28", type: "sale", qty: -4, balance: 13, reference: "SO-2026-069" },
      { date: "2026-08-11", type: "adjustment", qty: 5, balance: 18, reference: "ADJ-2026-014" }
    ],
    "PRD021": [
      { date: "2026-06-10", type: "purchase", qty: 50, balance: 50, reference: "PO-2026-004" },
      { date: "2026-06-25", type: "sale", qty: -10, balance: 40, reference: "SO-2026-045" },
      { date: "2026-07-08", type: "purchase", qty: 50, balance: 90, reference: "PO-2026-004" },
      { date: "2026-07-20", type: "sale", qty: -15, balance: 75, reference: "SO-2026-064" },
      { date: "2026-08-13", type: "sale", qty: -20, balance: 55, reference: "SO-2026-083" }
    ],
    "PRD022": [
      { date: "2026-06-12", type: "purchase", qty: 30, balance: 30, reference: "PO-2026-004" },
      { date: "2026-06-26", type: "sale", qty: -10, balance: 20, reference: "SO-2026-046" },
      { date: "2026-07-08", type: "purchase", qty: 30, balance: 50, reference: "PO-2026-004" },
      { date: "2026-07-25", type: "sale", qty: -20, balance: 30, reference: "SO-2026-068" },
      { date: "2026-08-06", type: "sale", qty: -28, balance: 2, reference: "SO-2026-078" }
    ],
    "PRD023": [
      { date: "2026-06-14", type: "purchase", qty: 30, balance: 30, reference: "PO-2026-006" },
      { date: "2026-06-28", type: "sale", qty: -5, balance: 25, reference: "SO-2026-048" },
      { date: "2026-07-15", type: "purchase", qty: 30, balance: 55, reference: "PO-2026-006" },
      { date: "2026-07-30", type: "sale", qty: -8, balance: 47, reference: "SO-2026-070" },
      { date: "2026-08-14", type: "adjustment", qty: -5, balance: 42, reference: "ADJ-2026-016" }
    ],
    "PRD024": [
      { date: "2026-06-18", type: "purchase", qty: 20, balance: 20, reference: "PO-2026-008" },
      { date: "2026-07-01", type: "sale", qty: -5, balance: 15, reference: "SO-2026-051" },
      { date: "2026-07-15", type: "sale", qty: -3, balance: 12, reference: "SO-2026-060" },
      { date: "2026-07-29", type: "sale", qty: -2, balance: 10, reference: "SO-2026-070" },
      { date: "2026-08-09", type: "sale", qty: -1, balance: 9, reference: "SO-2026-081" }
    ],
    "PRD025": [
      { date: "2026-06-15", type: "purchase", qty: 20, balance: 20, reference: "PO-2026-004" },
      { date: "2026-06-29", type: "sale", qty: -5, balance: 15, reference: "SO-2026-048" },
      { date: "2026-07-10", type: "purchase", qty: 20, balance: 35, reference: "PO-2026-004" },
      { date: "2026-07-24", type: "sale", qty: -6, balance: 29, reference: "SO-2026-066" },
      { date: "2026-08-13", type: "sale", qty: -5, balance: 24, reference: "SO-2026-083" }
    ]
  }
};
