import { PrismaClient } from '@prisma/client';
import { ragService } from '../src/services/rag.service';

const prisma = new PrismaClient();

async function main() {
    console.log('Start seeding ...');

    const xpander = await prisma.carModel.upsert({
        where: { name: 'Xpander' },
        update: {},
        create: {
            name: 'Xpander',
            segment: 'MPV',
            description: 'The reliable family MPV.',
            variants: {
                create: [
                    {
                        name: 'GLX M/T',
                        srp: 1068000,
                        transmission: 'M/T',
                        fuel: 'Gasoline',
                        specs: { engine: '1.5L MIVEC', seats: 7 },
                    },
                    {
                        name: 'GLS A/T',
                        srp: 1198000,
                        transmission: 'A/T',
                        fuel: 'Gasoline',
                        specs: { engine: '1.5L MIVEC', seats: 7, features: ['Touchscreen', 'Reverse Camera'] },
                    },
                ],
            },
        },
    });

    const montero = await prisma.carModel.upsert({
        where: { name: 'Montero Sport' },
        update: {},
        create: {
            name: 'Montero Sport',
            segment: 'SUV',
            description: 'Elevate your journey.',
            variants: {
                create: [
                    {
                        name: 'GLX 2WD M/T',
                        srp: 1568000,
                        transmission: 'M/T',
                        fuel: 'Diesel',
                        specs: { engine: '2.4L Clean Diesel', seats: 7 },
                    },
                    {
                        name: 'Black Series',
                        srp: 2100000,
                        transmission: 'A/T',
                        fuel: 'Diesel',
                        specs: { engine: '2.4L Clean Diesel', seats: 7, features: ['Black Accents', 'Advanced Safety'] },
                    },
                ],
            },
        },
    });

    // Create default price rules for NCR
    const priceRule = await prisma.priceRule.upsert({
        where: { id: 1 },
        update: {},
        create: {
            region: 'NCR',
            fees: {
                registration: 5000,
                chattel: 15000,
                insurance: 0, // Will be calculated as % of SRP
                documentation: 2000,
            },
            promos: {
                discount: 10000,
                freebies: ['Window Tint', 'Floor Matting', 'Seat Covers'],
            },
            description: 'Default pricing for Metro Manila',
        },
    });

    // Add sample media for Xpander variants
    const xpanderGLS = await prisma.carVariant.findFirst({
        where: { name: 'GLS A/T', modelId: xpander.id },
    });

    if (xpanderGLS) {
        await prisma.carMedia.createMany({
            skipDuplicates: true,
            data: [
                {
                    variantId: xpanderGLS.id,
                    url: 'https://www.mitsubishi-motors.com.ph/content/dam/mitsubishi-motor/images/cars/xpander/2023/gls/primary/exterior/xpander-gls-red-1.jpg',
                    type: 'IMAGE',
                    label: 'Front View',
                },
                {
                    variantId: xpanderGLS.id,
                    url: 'https://www.mitsubishi-motors.com.ph/content/dam/mitsubishi-motor/images/cars/xpander/2023/gls/primary/exterior/xpander-gls-red-2.jpg',
                    type: 'IMAGE',
                    label: 'Side View',
                },
                {
                    variantId: xpanderGLS.id,
                    url: 'https://www.mitsubishi-motors.com.ph/content/dam/mitsubishi-motor/images/cars/xpander/2023/gls/primary/interior/xpander-gls-interior-1.jpg',
                    type: 'IMAGE',
                    label: 'Interior',
                },
            ],
        });
    }

    // Seed initial FAQs
    console.log('Seeding FAQs...');
    await ragService.seedInitialFAQs();

    console.log({ xpander, montero, priceRule });
    console.log('Seeding completed!');
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
