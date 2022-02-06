import { connectToDatabase } from "../../lib/util/mongodb";
import {NextApiRequest, NextApiResponse} from "next";
import _ from 'lodash';
import { runMiddleware } from '../../lib/util/middleware';
import Cors from 'cors';
import {cleanupPriceName} from "../../lib/util/utils";
import {countries, countryCodes, countryCodesMap} from "../../data/countries";

// Initializing the cors middleware
const cors = Cors({
  methods: ['GET', 'POST'],
});


function getCategory(vendor, name, categoryByProduct) {
  if(categoryByProduct[name]) {
    return categoryByProduct[name];
  }
  return null;
}


export async function calculateCategoriesCount(country) {
  const {db} = await connectToDatabase();

  if (!country) {
    country = countries["United States"].code;
  }

  // @ts-ignore
  if (!countryCodesMap[country]) {
    throw new Error('Country name not found, must be in the list of country names');
  }

  let countryFilter: any = country;
  if (country === countries["United States"].code) {
    countryFilter = {$in: [country, null]};
  }

  const vendorsObj = await db.collection('_vendors').find({country: countryFilter}).toArray();


  const vendorsToCountry = vendorsObj.reduce((vbc, v)=>{vbc[v.name] = v.country || 'US'; return vbc;}, {});
  let vendorNames = vendorsObj.map(v => v.name);
  vendorNames = _.union(vendorNames, ['walmart', 'kroger', 'zillow']);

  let categories = await db.collection('_categories').find().toArray();
  let categoryByProduct = {};
  categories.reduce((r, item) => {
    categoryByProduct[item.name] = item.category;
  }, {});

  // Make a map for accessing prices by date and product/vendor
  const uncategorised = {};

  await Promise.all(vendorNames.map(async (vendor) => {
      let count = 0;
      let prices = await db
          .collection(vendor)
          .find({country: countryFilter})
          .toArray();

      await Promise.all(prices.map(async (price) => {
        let category = getCategory(price.vendor, price.name, categoryByProduct);
        if (!category) {
          const cleanedUpName = cleanupPriceName(price.name);
          if (!uncategorised[cleanedUpName]) {
            count++;
            uncategorised[cleanedUpName] = vendorsToCountry[vendor];
          }
        }
      }));
  }));

  return Object.keys(uncategorised);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<any>
) {
  // Run the middleware
  await runMiddleware(req, res, cors);
  let { country } = req.query;
  try {
    const dataObj = await calculateCategoriesCount(country);
    return res.status(200).json(JSON.stringify(dataObj, null, 2));
  } catch(err) {
    console.error('err', err);
    return res.status(400).json({message:err && (err as any).toString()});
  }
}