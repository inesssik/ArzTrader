-- CreateEnum
CREATE TYPE "MarketListingType" AS ENUM ('SELL', 'BUY');

-- CreateTable
CREATE TABLE "telegram_user" (
    "id" TEXT NOT NULL,
    "username" TEXT,

    CONSTRAINT "telegram_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "server" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "server_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player" (
    "id" SERIAL NOT NULL,
    "username" TEXT,
    "serverId" INTEGER NOT NULL,

    CONSTRAINT "player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_listing" (
    "id" SERIAL NOT NULL,
    "itemId" INTEGER NOT NULL,
    "type" "MarketListingType" NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "quantity" INTEGER NOT NULL,
    "username" TEXT NOT NULL,
    "lavkaUid" INTEGER NOT NULL,
    "serverId" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "market_listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_history" (
    "id" SERIAL NOT NULL,
    "itemId" INTEGER NOT NULL,
    "type" "MarketListingType" NOT NULL,
    "serverId" INTEGER NOT NULL,
    "minPrice" DOUBLE PRECISION NOT NULL,
    "maxPrice" DOUBLE PRECISION NOT NULL,
    "avgPrice" DOUBLE PRECISION NOT NULL,
    "medianPrice" DOUBLE PRECISION NOT NULL,
    "totalVolume" INTEGER NOT NULL,
    "listingsCount" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_stall_history" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "itemId" INTEGER NOT NULL,
    "type" "MarketListingType" NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "serverId" INTEGER NOT NULL,
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_stall_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscriptionId" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL,

    CONSTRAINT "subscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Item_name_key" ON "Item"("name");

-- CreateIndex
CREATE INDEX "market_listing_itemId_type_price_idx" ON "market_listing"("itemId", "type", "price");

-- CreateIndex
CREATE INDEX "market_listing_lavkaUid_serverId_idx" ON "market_listing"("lavkaUid", "serverId");

-- CreateIndex
CREATE INDEX "price_history_itemId_timestamp_idx" ON "price_history"("itemId", "timestamp");

-- CreateIndex
CREATE INDEX "player_stall_history_username_serverId_idx" ON "player_stall_history"("username", "serverId");

-- CreateIndex
CREATE UNIQUE INDEX "player_stall_history_username_itemId_type_price_serverId_key" ON "player_stall_history"("username", "itemId", "type", "price", "serverId");

-- CreateIndex
CREATE UNIQUE INDEX "user_subscription_userId_subscriptionId_key" ON "user_subscription"("userId", "subscriptionId");

-- AddForeignKey
ALTER TABLE "market_listing" ADD CONSTRAINT "market_listing_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_stall_history" ADD CONSTRAINT "player_stall_history_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_subscription" ADD CONSTRAINT "user_subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "telegram_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_subscription" ADD CONSTRAINT "user_subscription_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
