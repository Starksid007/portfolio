const creditCards = [
    {
        bank: "HDFC Bank",
        name: "HDFC Regalia Credit Card",
        image: "https://via.placeholder.com/280x180",
        benefits: {
            welcomeBenefits: "NA",
            domesticLounge: "4 per quarter (India)",
            internationalLounge: "2 per year (Outside India)",
            spendBased: "Yes, spend ₹5L for unlimited access",
            railwayLounge: "Yes, 4 per quarter",
            movieOffer: "₹500 off per month",
            golfAccess: "2 rounds per month",
            coupons: "Amazon ₹1000 voucher on spending ₹1L",
        },
        cashbackRewards: {
            cashback: "5% on online spends",
            rewardPoints: "4X on dining & travel",
        },
        fees: {
            joiningFee: "₹2,500",
            annualFee: "₹2,500",
            lifetimeFree: false,
        },
        applyLink: "https://www.hdfcbank.com/apply-regalia"
    },
    {
        bank: "ICICI Bank",
        name: "ICICI Coral Credit Card",
        image: "https://via.placeholder.com/280x180",
        benefits: {
            welcomeBenefits: "NA",
            domesticLounge: "1 per quarter (India)",
            internationalLounge: "Not Available",
            spendBased: "No",
            railwayLounge: "No",
            movieOffer: "₹250 off per month",
            golfAccess: "Not Available",
            coupons: "Paytm ₹500 cashback on ₹5000 spend",
        },
        cashbackRewards: {
            cashback: "2% on all spends",
            rewardPoints: "3X on dining",
        },
        fees: {
            joiningFee: "₹500",
            annualFee: "₹500",
            lifetimeFree: true,
        },
        applyLink: "https://www.icicibank.com/apply-coral"
    },
    {
        bank: "Axis Bank",
        name: "Indianoil Axis Bank Credit Card",
        image: "https://via.placeholder.com/280x180",
        benefits: {
            welcomeBenefits: "NA",
            domesticLounge: "NA",
            internationalLounge: "NA",
            spendBased: "NA",
            railwayLounge: "NA",
            movieOffer: "10% off on movie tickets ( BMS )",
            golfAccess: "NA",
            coupons: "10% Off on Swiggy & Amazon Fresh ( Every Wednesday )",
        },
        cashbackRewards: {
            cashback: "1% Fuel Surcharge Waiver ( 400 - 4000 Rs )",
            rewardPoints: "1 Edge Reward Points on 100 rs spent, 20 Reward Points for 100 Rs Fuel Txn.",
        },
        fees: {
            joiningFee: "₹500",
            annualFee: "₹500",
            lifetimeFree: false,
        },
        applyLink: "https://web.axisbank.co.in/DigitalChannel/WebForm/?index6&utm_content=ioclproduct&utm_campaign=cciocl&utm_source=website&axisreferralcode=ioclproduct&_gl=1*1khasj7*_gcl_au*MTUwMDM4NDk3Ny4xNzM4NTAxNDI2*_ga*MjAyNDczNzYxMi4xNzM4NTAxNDI2*_ga_CH41PE7401*MTczOTU5OTYzMi43LjEuMTczOTU5OTkxMy41Ni4wLjA."
    },
    {
        bank: "Axis Bank",
        name: "Rewards Credit Card",
        image: "https://via.placeholder.com/280x180",
        benefits: {
            welcomeBenefits: "NA",
            domesticLounge: "2 per quarter (India)",
            internationalLounge: "NA",
            spendBased: "On spend of Rs. 50,000 in previous quarter.",
            railwayLounge: "NA",
            movieOffer: "10% off on movie tickets ( BMS )",
            golfAccess: "NA",
            coupons: "30% Off on Swiggy on Minimum 200 Rs Txn. ( Max 150 Discount ), 10% Off on Swiggy & Amazon Fresh ( Every Wednesday )",
        },
        cashbackRewards: {
            cashback: "1% Fuel Surcharge Waiver ( 400 - 5000 Rs )",
            rewardPoints: "2 Edge Reward Points on 125 rs spent, 20 Reward Points for 100 Rs Fuel Txn.",
        },
        fees: {
            joiningFee: "₹1000",
            annualFee: "₹1000",
            lifetimeFree: false,
        },
        applyLink: "https://web.axisbank.co.in/DigitalChannel/WebForm/?index6&utm_content=ioclproduct&utm_campaign=cciocl&utm_source=website&axisreferralcode=ioclproduct&_gl=1*1khasj7*_gcl_au*MTUwMDM4NDk3Ny4xNzM4NTAxNDI2*_ga*MjAyNDczNzYxMi4xNzM4NTAxNDI2*_ga_CH41PE7401*MTczOTU5OTYzMi43LjEuMTczOTU5OTkxMy41Ni4wLjA."
    },
    {
        bank: "Axis Bank",
        name: "Axis Bank Magnus Credit Card",
        image: "https://via.placeholder.com/280x180",
        benefits: {
            welcomeBenefits: "NA",
            domesticLounge: "Unlimited (India)",
            internationalLounge: "Unlimited (Outside India)",
            spendBased: "On spend of Rs. 50,000 in previous quarter.",
            railwayLounge: "NA",
            movieOffer: "10% off on movie tickets ( BMS )",
            golfAccess: "NA",
            coupons: "30% Off on EazyDiner",
        },
        cashbackRewards: {
            cashback: "TBD",
            rewardPoints: "TBD",
        },
        fees: {
            joiningFee: "₹12500 ( Vouchers worth 12,500)",
            annualFee: "₹12500",
            lifetimeFree: false,
        },
        applyLink: "https://web.axisbank.co.in/DigitalChannel/WebForm/?index6&utm_content=ioclproduct&utm_campaign=cciocl&utm_source=website&axisreferralcode=ioclproduct&_gl=1*1khasj7*_gcl_au*MTUwMDM4NDk3Ny4xNzM4NTAxNDI2*_ga*MjAyNDczNzYxMi4xNzM4NTAxNDI2*_ga_CH41PE7401*MTczOTU5OTYzMi43LjEuMTczOTU5OTkxMy41Ni4wLjA."
    },
    {
        bank: "Axis Bank",
        name: "Axis Bank Vistara Credit Card",
        image: "https://via.placeholder.com/280x180",
        benefits: {
            welcomeBenefits: "Complimentary Economy Class Ticket ( Annually )",
            domesticLounge: "2 per quarter (India)",
            internationalLounge: "NA",
            spendBased: "On spend of Rs. 50,000 in previous quarter.",
            railwayLounge: "NA",
            movieOffer: "NA",
            golfAccess: "NA",
            coupons: "10% Off on Swiggy & Amazon Fresh ( Every Wednesday )",
        },
        cashbackRewards: {
            cashback: "TBD",
            rewardPoints: "TBD",
        },
        fees: {
            joiningFee: "₹1500",
            annualFee: "₹1500",
            lifetimeFree: false,
        },
        applyLink: "https://web.axisbank.co.in/DigitalChannel/WebForm/?index6&utm_content=ioclproduct&utm_campaign=cciocl&utm_source=website&axisreferralcode=ioclproduct&_gl=1*1khasj7*_gcl_au*MTUwMDM4NDk3Ny4xNzM4NTAxNDI2*_ga*MjAyNDczNzYxMi4xNzM4NTAxNDI2*_ga_CH41PE7401*MTczOTU5OTYzMi43LjEuMTczOTU5OTkxMy41Ni4wLjA."
    },
    {
        bank: "Axis Bank",
        name: "Flipkart Axis Bank Credit Card",
        image: "https://via.placeholder.com/280x180",
        benefits: {
            welcomeBenefits: "500 Flipkart Voucher",
            domesticLounge: "4 per year (India)",
            internationalLounge: "NA",
            spendBased: "On spend of Rs. 50,000 in previous quarter.",
            railwayLounge: "NA",
            movieOffer: "NA",
            golfAccess: "NA",
            coupons: "10% Off on Swiggy & Amazon Fresh ( Every Wednesday )",
        },
        cashbackRewards: {
            cashback: "5% Unlimited Cashback On Flipkart",
            rewardPoints: "TBD",
        },
        fees: {
            joiningFee: "₹500",
            annualFee: "₹500",
            lifetimeFree: false,
        },
        applyLink: "https://web.axisbank.co.in/DigitalChannel/WebForm/?index6&utm_content=ioclproduct&utm_campaign=cciocl&utm_source=website&axisreferralcode=ioclproduct&_gl=1*1khasj7*_gcl_au*MTUwMDM4NDk3Ny4xNzM4NTAxNDI2*_ga*MjAyNDczNzYxMi4xNzM4NTAxNDI2*_ga_CH41PE7401*MTczOTU5OTYzMi43LjEuMTczOTU5OTkxMy41Ni4wLjA."
    },
    {
        bank: "Axis Bank",
        name: "Axis Bank MY Zone Credit Card",
        image: "https://via.placeholder.com/280x180",
        benefits: {
            welcomeBenefits: "1 Year Sony LIV Membership",
            domesticLounge: "4 per year (India)",
            internationalLounge: "NA",
            spendBased: "On spend of Rs. 50,000 in previous quarter.",
            railwayLounge: "NA",
            movieOffer: "B1G1 on District App ( Max 200 Rs )",
            golfAccess: "NA",
            coupons: "Flat 120 Rs Off on Swiggy ( Min 500 Rs Spend ), 15% On EazyDiner upto 500 ( Min Spend 2500 ) ",
        },
        cashbackRewards: {
            cashback: "5% Unlimited Cashback On Flipkart",
            rewardPoints: "TBD",
        },
        fees: {
            joiningFee: "₹500",
            annualFee: "₹500",
            lifetimeFree: true,
        },
        applyLink: "https://web.axisbank.co.in/DigitalChannel/WebForm/?index6&utm_content=ioclproduct&utm_campaign=cciocl&utm_source=website&axisreferralcode=ioclproduct&_gl=1*1khasj7*_gcl_au*MTUwMDM4NDk3Ny4xNzM4NTAxNDI2*_ga*MjAyNDczNzYxMi4xNzM4NTAxNDI2*_ga_CH41PE7401*MTczOTU5OTYzMi43LjEuMTczOTU5OTkxMy41Ni4wLjA."
    }
];

function displayCards(cards = creditCards) {
    const container = document.getElementById("creditCardContainer");
    container.innerHTML = "";

    cards.forEach(card => {
        const cardElement = document.createElement("div");
        cardElement.classList.add("card");

        cardElement.innerHTML = `
            <h3>${card.name}</h3>
            <p class="bank-name">${card.bank}</p>
            <p><strong>Welcome Benefits:</strong> ${card.benefits.welcomeBenefits}</p>
            <p><strong>Domestic Lounge:</strong> ${card.benefits.domesticLounge}</p>
            <p><strong>International Lounge:</strong> ${card.benefits.internationalLounge}</p>
            <p><strong>Spend-Based Access:</strong> ${card.benefits.spendBased}</p>
            <p><strong>Railway Lounge:</strong> ${card.benefits.railwayLounge}</p>
            <p><strong>Movie Offer:</strong> ${card.benefits.movieOffer}</p>
            <p><strong>Golf Access:</strong> ${card.benefits.golfAccess}</p>
            <p><strong>Coupons:</strong> ${card.benefits.coupons}</p>

            <div class="dropdown">
                <span>💰 Cashback & Rewards ▼</span>
                <div class="dropdown-content">
                    <p><strong>Cashback:</strong> ${card.cashbackRewards.cashback}</p>
                    <p><strong>Reward Points:</strong> ${card.cashbackRewards.rewardPoints}</p>
                </div>
            </div>

            <p><strong>Joining Fee:</strong> ${card.fees.joiningFee}</p>
            <p><strong>Annual Fee:</strong> ${card.fees.annualFee}</p>
            ${card.fees.lifetimeFree ? "<p><strong>Lifetime Free</strong></p>" : ""}

            <a href="${card.applyLink}" target="_blank" class="apply-btn">Apply Now</a>
        `;

        container.appendChild(cardElement);
    });
}

function searchCards() {
    const searchText = document.getElementById("searchBox").value.toLowerCase();
    const filteredCards = creditCards.filter(card => 
        card.name.toLowerCase().includes(searchText) || 
        card.bank.toLowerCase().includes(searchText)
    );
    displayCards(filteredCards);
}

window.onload = () => displayCards();
