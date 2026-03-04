// src/config/gmail.ts
import { PubSub } from '@google-cloud/pubsub';

let pubsubClient: PubSub | null = null;

export function getPubSubClient(): PubSub {
    if (!pubsubClient) {
        pubsubClient = new PubSub({
            projectId: process.env.GCP_PROJECT_ID,
            keyFilename: process.env.GCP_KEY_FILE // Path a service account JSON
        });
    }
    return pubsubClient;
}

export async function setupPubSubTopic() {
    const pubsub = getPubSubClient();
    const topicName = process.env.GMAIL_PUBSUB_TOPIC!.split('/').pop()!;

    try {
        const [topic] = await pubsub.topic(topicName).get({ autoCreate: true });
        console.log(`✅ Pub/Sub topic ready: ${topic.name}`);

        // Crear suscripción push si no existe
        const subscriptionName = `${topicName}-push`;
        const pushEndpoint = `${process.env.API_URL}/api/gmail/webhook`;

        try {
            await pubsub.subscription(subscriptionName).get();
            console.log(`✅ Subscription already exists: ${subscriptionName}`);
        } catch {
            await topic.createSubscription(subscriptionName, {
                pushConfig: {
                    pushEndpoint
                },
                ackDeadlineSeconds: 30
            });
            console.log(`✅ Created push subscription: ${subscriptionName}`);
        }
    } catch (error) {
        console.error('❌ Error setting up Pub/Sub:', error);
        throw error;
    }
}