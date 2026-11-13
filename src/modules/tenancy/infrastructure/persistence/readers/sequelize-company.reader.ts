import { CompanyReaderPort, CompanySummary } from "../../../application/ports/company-reader.port";
import { CompanyModel } from "../model/company.model";

/** Adapter Sequelize do `CompanyReaderPort`. */
export class SequelizeCompanyReader
    implements CompanyReaderPort {
    async findById(id: number): Promise<CompanySummary | null> {
        const model = await CompanyModel.findByPk(id);

        if (!model) {
            return null;
        }

        return {
            id: model.id,
            name: model.name,
            slug: model.slug,
            status: model.status,
        };
    }
}
