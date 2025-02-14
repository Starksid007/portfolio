const creditCards = [
    {
        bank: "HDFC Bank",
        name: "HDFC Regalia Credit Card",
        image: "https://via.placeholder.com/250",
        benefits: "Earn reward points, lounge access, fuel surcharge waiver",
        fees: "Annual Fee: ₹2,500"
    },
    {
        bank: "ICICI Bank",
        name: "ICICI Coral Credit Card",
        image: "https://via.placeholder.com/250",
        benefits: "Movie discounts, reward points, airport lounge access",
        fees: "Annual Fee: ₹500"
    },
    {
        bank: "SBI Bank",
        name: "SBI SimplyCLICK Credit Card",
        image: "https://via.placeholder.com/250",
        benefits: "Online shopping rewards, Amazon vouchers, fuel surcharge waiver",
        fees: "Annual Fee: ₹499"
    },
    {
        bank: "Axis Bank",
        name: "Axis Magnus Credit Card",
        image: "https://via.placeholder.com/250",
        benefits: "Luxury hotel perks, complimentary lounge access",
        fees: "Annual Fee: ₹10,000"
    }
];

// Function to display all cards
function displayCards() {
    const container = document.getElementById("creditCardContainer");
    container.innerHTML = "";

    creditCards.forEach(card => {
        const cardElement = document.createElement("div");
        cardElement.classList.add("card");

        cardElement.innerHTML = `
            <img src="${card.image}" alt="${card.name}">
            <h3>${card.name}</h3>
            <p class="bank-name">${card.bank}</p>
            <p><strong>Benefits:</strong> ${card.benefits}</p>
            <p><strong>Fees:</strong> ${card.fees}</p>
        `;

        container.appendChild(cardElement);
    });
}

// Function to filter cards based on search input
function searchCards() {
    const searchText = document.getElementById("searchBox").value.toLowerCase();
    const container = document.getElementById("creditCardContainer");
    container.innerHTML = "";

    creditCards.forEach(card => {
        if (card.name.toLowerCase().includes(searchText) || card.bank.toLowerCase().includes(searchText)) {
            const cardElement = document.createElement("div");
            cardElement.classList.add("card");

            cardElement.innerHTML = `
                <img src="${card.image}" alt="${card.name}">
                <h3>${card.name}</h3>
                <p class="bank-name">${card.bank}</p>
                <p><strong>Benefits:</strong> ${card.benefits}</p>
                <p><strong>Fees:</strong> ${card.fees}</p>
            `;

            container.appendChild(cardElement);
        }
    });
}

// Load all cards on page load
window.onload = displayCards;
