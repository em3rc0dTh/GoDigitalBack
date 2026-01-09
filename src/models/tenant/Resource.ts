import mongoose, { Document, Model } from "mongoose";

export interface ResourceDocument extends Document {
    tenantDetailId: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId; // Link to System User
    resourceRole: string; // Ref to ResourceRoles.name
    relevantMetadata: any;
    createdAt: Date;
    updatedAt: Date;
}

const ResourceSchema = new mongoose.Schema({
    tenantDetailId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        // ref: 'User' // System DB ref
    },
    resourceRole: {
        type: String, // Storing role name as per schema
        required: true
    },
    relevantMetadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, {
    timestamps: true,
    collection: 'resources'
});

export function getResourceModel(connection: mongoose.Connection): Model<ResourceDocument> {
    return connection.model<ResourceDocument>("Resource", ResourceSchema);
}
