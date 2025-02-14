const creditCards = [
    {
        bank: "HDFC Bank",
        name: "HDFC Regalia Credit Card",
        benefits: {
            domesticLounge: { access: "12 complimentary visits per year", spendBased: "Spend ₹5L annually for unlimited access" },
            internationalLounge: { access: "6 complimentary visits per year", spendBased: "Spend ₹8L annually for unlimited access" },
            railwayLounge: { access: "2 complimentary visits per quarter", spendBased: "Not required" },
            movieOffer: "₹500 off per month",
            golfAccess: "2 rounds per month",
            coupons: "Amazon ₹1000 voucher on spending ₹1L",
        },
        cashbackRewards: {
            cashback: "5% on online spends",
            rewardPoints: "4X on dining & travel",
        },
        fees: {
            joiningFee: "₹2,500 + GST",
            annualFee: "₹2,500 + GST",
            lifetimeFree: false,
        },
        applyLink: "https://www.hdfcbank.com/personal/pay/cards/credit-cards"
    },
    {
        bank: "ICICI Bank",
        name: "ICICI Platinum Chip Credit Card",
        benefits: {
            domesticLounge: { access: "4 complimentary visits per quarter", spendBased: "Spend ₹2L annually for unlimited access" },
            internationalLounge: { access: "2 complimentary visits per year", spendBased: "Spend ₹3L annually" },
            railwayLounge: { access: "Not available", spendBased: "Not required" },
            movieOffer: "₹250 off per month",
            golfAccess: "Not available",
            coupons: "10% cashback on partner brands",
        },
        cashbackRewards: {
            cashback: "2% on all spends",
            rewardPoints: "2 PAYBACK points per ₹100 spent",
        },
        fees: {
            joiningFee: "None",
            annualFee: "None",
            lifetimeFree: true,
        },
        applyLink: "https://www.icicibank.com/personal-banking/cards/credit-card"
    }
];

function displayCards(cards) {
    const container = document.getElementById('creditCardContainer');
    container.innerHTML = '';
    cards.forEach(card => {
        const cardElement = document.createElement('div');
        cardElement.classList.add('card');
        cardElement.innerHTML = `
            <h2>${card.name}</h2>
            <p><strong>Bank:</strong> ${card.bank}</p>
            <p class="sub-heading">Domestic Lounge Access:</p>
            <p>${card.benefits.domesticLounge.access}</p>
            <p class="spend-based">Spend Criteria: ${card.benefits.domesticLounge.spendBased}</p>
            
            <p class="sub-heading">International Lounge Access:</p>
            <p>${card.benefits.internationalLounge.access}</p>
            <p class="spend-based">Spend Criteria: ${card.benefits.internationalLounge.spendBased}</p>

            <p class="sub-heading">Railway Lounge Access:</p>
            <p>${card.benefits.railwayLounge.access}</p>
            <p class="spend-based">Spend Criteria: ${card.benefits.railwayLounge.spendBased}</p>

            <p><strong>Movie Offer:</strong> ${card.benefits.movieOffer}</p>
            <p><strong>Golf Access:</strong> ${card.benefits.golfAccess}</p>
            <p><strong>Special Coupons/Features:</strong> ${card.benefits.coupons}</p>

            <div class="dropdown">
                <button onclick="toggleDropdown(this)">Cashback and Reward Points</button>
                <div class="dropdown-content">
                    <p><strong>Cashback:</strong> ${card.cashbackRewards.cashback}</p>
                    <p><strong>Reward Points:</strong> ${card.cashbackRewards.rewardPoints}</p>
                </div>
            </div>

            <p><strong>Joining Fee:</strong> ${card.fees.joiningFee}</p>
            <p><strong>Annual Fee:</strong> ${card.fees.annualFee}</p>
            ${card.fees.lifetimeFree ? '<p><strong>Lifetime Free:</strong> Yes</p>' : ''}
            <a href="${card.applyLink}" class="apply-button" target="_blank">Apply Now</a>
        `;
        container.appendChild(cardElement);
    });
}

function toggleDropdown(button) {
    const content = button.nextElementSibling;
    content.style.display = content.style.display === "block" ? "none" : "block";
}

document.addEventListener("DOMContentLoaded", () => displayCards(creditCards));
