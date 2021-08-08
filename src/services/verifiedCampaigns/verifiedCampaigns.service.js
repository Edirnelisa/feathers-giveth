const errors = require('@feathersjs/errors');
const config = require('config');
const logger = require('winston');
const { findCampaignByGivethIoProjectId } = require('../../repositories/campaignRepository');
const { getGivethIoAdapter } = require('../../adapters/adapterFactory');

const givethIoAdapter = getGivethIoAdapter();
module.exports = function verifiedCampaigns() {
  const app = this;

  const service = {
    async create(data, params) {
      const { txHash, url, slug } = data;

      const projectInfo = await givethIoAdapter.getProjectInfoBySLug(slug);
      const { id: givethIoProjectId, title, description, image } = projectInfo;
      const owner = await givethIoAdapter.getUserByUserId(projectInfo.admin);
      if (params.user.address.toLowerCase() !== owner.walletAddress.toLowerCase()) {
        throw new errors.Forbidden('The owner of project in givethIo is not you');
      }
      let campaign = await findCampaignByGivethIoProjectId(app, givethIoProjectId);
      if (campaign) {
        throw new errors.BadRequest('Campaign with this givethIo projectId exists');
      }
      const pianataBaseUrl = 'https://gateway.pinata.cloud';
      campaign = await app.service('campaigns').create({
        title,
        url,
        slug,
        reviewerAddress: config.givethIoProjectsReviewerAddress,
        description,
        txHash,
        // Image sometimes is null or "" or something like "3" so we should do some checking on it
        image: image && image.includes(pianataBaseUrl) ? image.replace(pianataBaseUrl, '') : image,
        ownerAddress: owner.walletAddress,
        givethIoProjectId,
      });
      return campaign;
    },

    async find({ query }) {
      const { slug, userAddress } = query;
      const projectInfo = await givethIoAdapter.getProjectInfoBySLug(slug);
      const { id: givethIoProjectId } = projectInfo;
      const owner = await givethIoAdapter.getUserByUserId(projectInfo.admin);

      if (owner.walletAddress !== userAddress) {
        logger.error('The owner of givethIo project is ', owner.walletAddress);
        throw new errors.Forbidden('The owner of project in givethIo is not you');
      }
      const campaign = await findCampaignByGivethIoProjectId(app, givethIoProjectId);
      if (campaign) {
        throw new errors.BadRequest('Campaign with this givethIo projectId exists');
      }
      return { ...projectInfo, owner };
    },
  };
  service.docs = {
    securities: ['create'],
    operations: {
      update: false,
      patch: false,
      remove: false,
      find: {
        description: 'Check if user can create campaign base on givethIo project',
        parameters: [
          {
            type: 'string',
            in: 'query',
            description: 'The slug of project in givethIo',
            name: 'slug',
          },
          {
            type: 'string',
            in: 'query',
            name: 'userAddress',
          },
        ],
      },
      create: {
        description: 'Create campaign base on givethIo project',
      },
    },
    definition: {
      type: 'object',
      properties: {
        slug: {
          type: 'string',
        },
        txHash: {
          type: 'string',
        },
        url: {
          description: 'ipfs url for project',
          type: 'string',
        },
      },
    },
  };
  app.use('/verifiedCampaigns', service);
};
