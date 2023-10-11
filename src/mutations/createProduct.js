import SimpleSchema from "simpl-schema";
import Random from "@reactioncommerce/random";
import ReactionError from "@reactioncommerce/reaction-error";
import cleanProductInput from "../utils/cleanProductInput.js";
import generateRandomReferenceId from "../utils/generateRandomReferenceId.js";

const inputSchema = new SimpleSchema({
  product: {
    type: Object,
    blackbox: true,
    optional: true,
  },
  shopId: String,
  shouldCreateFirstVariant: {
    type: Boolean,
    optional: true,
  },
});

/**
 * @method createProduct
 * @summary creates an empty product, with an empty variant
 * @param {Object} context - an object containing the per-request state
 * @param {Object} input - Input arguments for the operation
 * @param {String} [input.product] - product data
 * @param {Boolean} [input.shouldCreateFirstVariant=true] - Auto-create one variant for the product
 * @param {String} input.shopId - the shop to create the product for
 * @return {String} created productId
 */
export default async function createProduct(context, input) {
  inputSchema.validate(input);

  const { appEvents, collections, simpleSchemas } = context;
  const { Product } = simpleSchemas;
  const { Products } = collections;
  const {
    product: productInput,
    shopId,
    shouldCreateFirstVariant = true,
  } = input;

  // Check that user has permission to create product
  await context.validatePermissions("reaction:legacy:products", "create", {
    shopId,
  });

  let newProductId = (productInput && productInput._id) || Random.id();
  let lastReferenceId = await generateRandomReferenceId(context);
  // let lastProductReferenceId = await ProductSequence.find().toArray();
  // console.log("lastProductReferenceId", lastProductReferenceId);
  // let lastReferenceId = lastProductReferenceId[0]?.lastRandomId
  //   ? (parseInt(lastGeneratedId[0]?.lastRandomId) + 1).toString()
  //   : 0;
  // ProductSequence.updateOne(
  //   { _id: lastProductReferenceId[0]?._id },
  //   {
  //     $set: {
  //       lastRandomId: lastReferenceId,
  //       updatedAt: new Date(),
  //     },
  //   }
  // );
  // let newOrderId=shop?.lastOrderId? parseInt(shop?.lastOrderId)+1:1;
  console.log("lastReferenceId", lastReferenceId);
  // if (isNaN(lastReferenceId)) {
  //   lastReferenceId = 0;
  // }

  const initialProductData = await cleanProductInput(context, {
    productId: newProductId,
    productInput,
    shopId,
  });
  console.log("initialProductData", initialProductData);

  if (initialProductData.isDeleted) {
    throw new ReactionError(
      "invalid-param",
      "Creating a deleted product is not allowed"
    );
  }

  const createdAt = new Date();
  const newProduct = {
    _id: newProductId,
    ancestors: [],
    createdAt,
    handle: "",
    isDeleted: false,
    isVisible: false,
    shopId,
    shouldAppearInSitemap: true,
    supportedFulfillmentTypes: ["shipping"],
    title: "",
    brandId: productInput.brandId,
    type: "simple",
    updatedAt: createdAt,
    workflow: {
      status: "new",
    },
    referenceId: lastReferenceId,
    ...initialProductData,
  };
  console.log("newProduct", newProduct);

  // Apply custom transformations from plugins.
  for (const customFunc of context.getFunctionsOfType(
    "mutateNewProductBeforeCreate"
  )) {
    // Functions of type "mutateNewProductBeforeCreate" are expected to mutate the provided variant.
    // We need to run each of these functions in a series, rather than in parallel, because
    // we are mutating the same object on each pass.
    // eslint-disable-next-line no-await-in-loop
    await customFunc(newProduct, { context });
  }

  Product.validate(newProduct);

  await Products.insertOne(newProduct);

  // Create one initial product variant for it
  // if (shouldCreateFirstVariant) {
  //   await context.mutations.createProductVariant(context.getInternalContext(), {
  //     productId: newProductId,
  //     shopId
  //   });
  // }

  await appEvents.emit("afterProductCreate", { product: newProduct });

  return newProduct;
}
